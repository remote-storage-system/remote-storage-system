const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const {
    registerRemoteRoutes
} = require("../remote.js");

const app = express();

const PORT = Number(
    process.env.PORT || 10000
);

// ============================================================
// CONFIGURATION
// ============================================================

const API_KEY =
    String(process.env.API_KEY || "").trim();

const STORAGE_ROOT =
    process.env.STORAGE_PATH ||
    path.join(__dirname, "storage");

const FILES_DIR =
    path.join(
        STORAGE_ROOT,
        "files"
    );

const TEMP_DIR =
    path.join(
        STORAGE_ROOT,
        "chunks"
    );

// public folder is one level above /server
const PUBLIC_DIR =
    path.join(
        __dirname,
        "../public"
    );

// 5 MB chunks
const CHUNK_SIZE =
    5 * 1024 * 1024;

// Maximum single file: 20 GB
const MAX_FILE_SIZE =
    20 *
    1024 *
    1024 *
    1024;


// ============================================================
// CREATE DIRECTORIES
// ============================================================

fs.mkdirSync(
    FILES_DIR,
    {
        recursive: true
    }
);

fs.mkdirSync(
    TEMP_DIR,
    {
        recursive: true
    }
);


// ============================================================
// MIDDLEWARE
// ============================================================

app.disable(
    "x-powered-by"
);

app.use(
    cors({
        origin: "*",

        methods: [
            "GET",
            "POST",
            "DELETE",
            "OPTIONS"
        ],

        allowedHeaders: [
            "Content-Type",
            "Authorization",
            "X-API-Key"
        ]
    })
);

app.use(
    express.json({
        limit: "25mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "25mb"
    })
);


// ============================================================
// API AUTHENTICATION
// ============================================================

function authenticate(
    req,
    res,
    next
) {

    if (!API_KEY) {

        return res.status(503).json({

            success: false,

            error:
                "Server API key is not configured"

        });

    }

    const xApiKey =
        String(
            req.headers["x-api-key"] || ""
        ).trim();

    const authorization =
        String(
            req.headers.authorization || ""
        );

    let providedKey =
        xApiKey;

    if (
        !providedKey &&
        authorization.startsWith(
            "Bearer "
        )
    ) {

        providedKey =
            authorization
                .slice(7)
                .trim();

    }

    if (
        !providedKey ||
        providedKey !== API_KEY
    ) {

        return res.status(401).json({

            success: false,

            error:
                "Unauthorized"

        });

    }

    next();

}


// ============================================================
// SAFE PATH
// ============================================================

function safePath(
    relativePath
) {

    if (
        relativePath === undefined ||
        relativePath === null
    ) {

        throw new Error(
            "Path required"
        );

    }

    let input =
        String(
            relativePath
        );

    input =
        input.replace(
            /\\/g,
            "/"
        );

    input =
        input.replace(
            /^\/+/,
            ""
        );

    const normalized =
        path.posix.normalize(
            input
        );

    if (
        normalized === "." ||
        normalized === ""
    ) {

        return FILES_DIR;

    }

    const parts =
        normalized
            .split("/")
            .filter(Boolean)
            .filter(
                part =>
                    part !== "." &&
                    part !== ".."
            );

    const cleaned =
        parts.join(
            path.sep
        );

    const root =
        path.resolve(
            FILES_DIR
        );

    const target =
        path.resolve(
            root,
            cleaned
        );

    if (
        target !== root &&
        !target.startsWith(
            root + path.sep
        )
    ) {

        throw new Error(
            "Invalid path"
        );

    }

    return target;

}


// ============================================================
// RELATIVE STORAGE PATH
// ============================================================

function relativeStoragePath(
    fullPath
) {

    return path
        .relative(
            FILES_DIR,
            fullPath
        )
        .replace(
            /\\/g,
            "/"
        );

}


// ============================================================
// CLOUD VAULT WEB PANEL
// ============================================================

if (
    fs.existsSync(
        PUBLIC_DIR
    )
) {

    app.use(
        express.static(
            PUBLIC_DIR
        )
    );

}

app.get(
    "/",
    (req, res) => {

        const indexFile =
            path.join(
                PUBLIC_DIR,
                "index.html"
            );

        if (
            fs.existsSync(
                indexFile
            )
        ) {

            return res.sendFile(
                indexFile
            );

        }

        res.status(200).send(`
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>Cloud Vault Pro</title>

<style>

body{
    margin:0;
    min-height:100vh;

    display:flex;
    align-items:center;
    justify-content:center;

    background:
        radial-gradient(
            circle at top,
            #172554,
            #020617 60%
        );

    color:white;

    font-family:
        system-ui,
        sans-serif;
}

.card{
    width:90%;
    max-width:600px;

    padding:30px;

    border-radius:25px;

    background:
        rgba(15,23,42,.95);

    text-align:center;

    box-shadow:
        0 25px 80px
        rgba(0,0,0,.5);
}

.status{
    display:inline-block;

    margin-top:10px;

    padding:8px 15px;

    border-radius:999px;

    background:#052e16;

    color:#4ade80;

    font-weight:700;
}

</style>

</head>

<body>

<div class="card">

<div style="font-size:50px">
☁️
</div>

<h1>
Cloud Vault Pro
</h1>

<div class="status">
● SERVER ONLINE
</div>

<p>
Server is running successfully.
</p>

<p>
Public folder was not found.
</p>

</div>

</body>

</html>
        `);

    }
);


// ============================================================
// HEALTH API
// ============================================================

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            success: true,

            service:
                "Cloud Vault Pro",

            status:
                "online",

            version:
                "2.0.0",

            authentication:
                API_KEY
                    ? "enabled"
                    : "not configured",

            timestamp:
                new Date().toISOString()

        });

    }
);


// ============================================================
// AUTHENTICATED API
// ============================================================

app.use(
    "/api",
    authenticate
);


// ============================================================
// SERVER STATUS
// ============================================================

app.get(
    "/api/status",
    (req, res) => {

        res.json({

            success: true,

            status:
                "online",

            storage:
                STORAGE_ROOT,

            filesDirectory:
                FILES_DIR,

            timestamp:
                new Date().toISOString()

        });

    }
);


// ============================================================
// STORAGE INFORMATION
// ============================================================

async function calculateStorage(
    directory
) {

    let total = 0;

    async function scan(
        current
    ) {

        let entries = [];

        try {

            entries =
                await fs.promises.readdir(
                    current,
                    {
                        withFileTypes: true
                    }
                );

        } catch {

            return;

        }

        for (
            const entry of entries
        ) {

            const full =
                path.join(
                    current,
                    entry.name
                );

            if (
                entry.isDirectory()
            ) {

                await scan(
                    full
                );

            } else {

                try {

                    const stat =
                        await fs.promises.stat(
                            full
                        );

                    total +=
                        stat.size;

                } catch {}

            }

        }

    }

    await scan(
        directory
    );

    return total;

}


app.get(
    "/api/storage",
    async (req, res) => {

        try {

            const used =
                await calculateStorage(
                    FILES_DIR
                );

            res.json({

                success:
                    true,

                used,

                usedMB:
                    (
                        used /
                        1024 /
                        1024
                    ).toFixed(2),

                usedGB:
                    (
                        used /
                        1024 /
                        1024 /
                        1024
                    ).toFixed(3)

            });

        } catch (error) {

            res.status(500).json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// LIST FILES
// ============================================================

app.get(
    "/api/files",
    async (req, res) => {

        try {

            const requestedPath =
                String(
                    req.query.path || ""
                );

            const directory =
                safePath(
                    requestedPath
                );

            if (
                !fs.existsSync(
                    directory
                )
            ) {

                return res.status(404).json({

                    success:
                        false,

                    error:
                        "Folder not found"

                });

            }

            const stat =
                await fs.promises.stat(
                    directory
                );

            if (
                !stat.isDirectory()
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Path is not a folder"

                });

            }

            const entries =
                await fs.promises.readdir(
                    directory,
                    {
                        withFileTypes: true
                    }
                );

            const result = [];

            for (
                const entry of entries
            ) {

                const fullPath =
                    path.join(
                        directory,
                        entry.name
                    );

                let size = 0;
                let modified = null;

                try {

                    const info =
                        await fs.promises.stat(
                            fullPath
                        );

                    if (
                        info.isFile()
                    ) {

                        size =
                            info.size;

                    }

                    modified =
                        info.mtime.toISOString();

                } catch {}

                result.push({

                    name:
                        entry.name,

                    type:
                        entry.isDirectory()
                            ? "folder"
                            : "file",

                    size,

                    modified,

                    path:
                        relativeStoragePath(
                            fullPath
                        )

                });

            }

            result.sort(
                (
                    a,
                    b
                ) => {

                    if (
                        a.type !==
                        b.type
                    ) {

                        return (
                            a.type ===
                            "folder"
                        )
                            ? -1
                            : 1;

                    }

                    return a.name.localeCompare(
                        b.name
                    );

                }
            );

            res.json({

                success:
                    true,

                path:
                    requestedPath,

                items:
                    result

            });

        } catch (error) {

            console.error(
                "List error:",
                error
            );

            res.status(500).json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// CREATE FOLDER
// ============================================================

app.post(
    "/api/folder",
    async (req, res) => {

        try {

            const folderPath =
                String(
                    req.body?.path || ""
                );

            if (!folderPath) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Folder path required"

                });

            }

            const directory =
                safePath(
                    folderPath
                );

            await fs.promises.mkdir(
                directory,
                {
                    recursive:
                        true
                }
            );

            res.json({

                success:
                    true,

                message:
                    "Folder created",

                path:
                    folderPath

            });

        } catch (error) {

            res.status(500).json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// DOWNLOAD FILE
// ============================================================

app.get(
    "/api/download",
    async (req, res) => {

        try {

            const filePath =
                String(
                    req.query.path || ""
                );

            if (!filePath) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "File path required"

                });

            }

            const fullPath =
                safePath(
                    filePath
                );

            if (
                !fs.existsSync(
                    fullPath
                )
            ) {

                return res.status(404).json({

                    success:
                        false,

                    error:
                        "File not found"

                });

            }

            const stats =
                await fs.promises.stat(
                    fullPath
                );

            if (
                !stats.isFile()
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Not a file"

                });

            }

            res.setHeader(
                "Content-Length",
                stats.size
            );

            res.setHeader(
                "Cache-Control",
                "no-cache"
            );

            res.download(
                fullPath,
                path.basename(
                    fullPath
                )
            );

        } catch (error) {

            if (
                !res.headersSent
            ) {

                res.status(500).json({

                    success:
                        false,

                    error:
                        error.message

                });

            }

        }

    }
);


// ============================================================
// DELETE FILE / FOLDER
// ============================================================

app.delete(
    "/api/files",
    async (req, res) => {

        try {

            const targetPath =
                String(
                    req.body?.path ||
                    req.query.path ||
                    ""
                );

            if (!targetPath) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Path required"

                });

            }

            const fullPath =
                safePath(
                    targetPath
                );

            const root =
                path.resolve(
                    FILES_DIR
                );

            const target =
                path.resolve(
                    fullPath
                );

            if (
                target === root
            ) {

                return res.status(403).json({

                    success:
                        false,

                    error:
                        "Root storage cannot be deleted"

                });

            }

            if (
                !fs.existsSync(
                    fullPath
                )
            ) {

                return res.status(404).json({

                    success:
                        false,

                    error:
                        "File or folder not found"

                });

            }

            await fs.promises.rm(
                fullPath,
                {
                    recursive:
                        true,
                    force:
                        true
                }
            );

            res.json({

                success:
                    true,

                message:
                    "Deleted successfully",

                path:
                    targetPath

            });

        } catch (error) {

            res.status(500).json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// RENAME
// ============================================================

app.post(
    "/api/rename",
    async (req, res) => {

        try {

            const oldPath =
                String(
                    req.body?.oldPath ||
                    ""
                );

            const newPath =
                String(
                    req.body?.newPath ||
                    ""
                );

            if (
                !oldPath ||
                !newPath
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "oldPath and newPath required"

                });

            }

            const oldFull =
                safePath(
                    oldPath
                );

            const newFull =
                safePath(
                    newPath
                );

            if (
                !fs.existsSync(
                    oldFull
                )
            ) {

                return res.status(404).json({

                    success:
                        false,

                    error:
                        "Original path not found"

                });

            }

            if (
                fs.existsSync(
                    newFull
                )
            ) {

                return res.status(409).json({

                    success:
                        false,

                    error:
                        "Destination already exists"

                });

            }

            await fs.promises.mkdir(
                path.dirname(
                    newFull
                ),
                {
                    recursive:
                        true
                }
            );

            await fs.promises.rename(
                oldFull,
                newFull
            );

            res.json({

                success:
                    true,

                oldPath,

                newPath

            });

        } catch (error) {

            res.status(500).json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// CHUNK UPLOAD
// ============================================================

app.post(
    "/api/upload/chunk",
    async (req, res) => {

        try {

            const {
                uploadId,
                fileName,
                relativePath,
                chunkIndex,
                totalChunks,
                data
            } = req.body || {};

            if (
                !uploadId ||
                !fileName ||
                data === undefined ||
                chunkIndex === undefined ||
                !totalChunks
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Missing upload information"

                });

            }

            if (
                !/^[a-zA-Z0-9_-]{8,100}$/
                    .test(
                        String(
                            uploadId
                        )
                    )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Invalid upload ID"

                });

            }

            const index =
                Number(
                    chunkIndex
                );

            const total =
                Number(
                    totalChunks
                );

            if (
                !Number.isInteger(index) ||
                !Number.isInteger(total) ||
                index < 0 ||
                index >= total
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Invalid chunk information"

                });

            }

            const buffer =
                Buffer.from(
                    String(data),
                    "base64"
                );

            if (
                buffer.length >
                CHUNK_SIZE + 1024
            ) {

                return res.status(413).json({

                    success:
                        false,

                    error:
                        "Chunk is too large"

                });

            }

            const uploadDirectory =
                path.join(
                    TEMP_DIR,
                    String(
                        uploadId
                    )
                );

            await fs.promises.mkdir(
                uploadDirectory,
                {
                    recursive:
                        true
                }
            );

            const metadataPath =
                path.join(
                    uploadDirectory,
                    "metadata.json"
                );

            let metadata = {

                uploadId:
                    String(
                        uploadId
                    ),

                fileName:
                    String(
                        fileName
                    ),

                relativePath:
                    String(
                        relativePath || ""
                    ),

                totalChunks:
                    total,

                createdAt:
                    Date.now()

            };

            if (
                fs.existsSync(
                    metadataPath
                )
            ) {

                try {

                    metadata =
                        JSON.parse(
                            await fs.promises.readFile(
                                metadataPath,
                                "utf8"
                            )
                        );

                } catch {}

            }

            await fs.promises.writeFile(
                metadataPath,
                JSON.stringify(
                    metadata,
                    null,
                    2
                )
            );

            const chunkFile =
                path.join(
                    uploadDirectory,
                    `${index}.chunk`
                );

            await fs.promises.writeFile(
                chunkFile,
                buffer
            );

            res.json({

                success:
                    true,

                uploadId,

                chunkIndex:
                    index,

                totalChunks:
                    total,

                bytes:
                    buffer.length,

                message:
                    "Chunk uploaded"

            });

        } catch (error) {

            console.error(
                "Chunk upload error:",
                error
            );

            res.status(500).json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// COMPLETE UPLOAD
// ============================================================

app.post(
    "/api/upload/complete",
    async (req, res) => {

        try {

            const {
                uploadId,
                fileName,
                relativePath,
                totalChunks
            } = req.body || {};

            if (
                !uploadId ||
                !fileName ||
                !totalChunks
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Missing upload information"

                });

            }

            if (
                !/^[a-zA-Z0-9_-]{8,100}$/
                    .test(
                        String(
                            uploadId
                        )
                    )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Invalid upload ID"

                });

            }

            const total =
                Number(
                    totalChunks
                );

            if (
                !Number.isInteger(total) ||
                total < 1
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Invalid totalChunks"

                });

            }

            const uploadDirectory =
                path.join(
                    TEMP_DIR,
                    String(
                        uploadId
                    )
                );

            if (
                !fs.existsSync(
                    uploadDirectory
                )
            ) {

                return res.status(404).json({

                    success:
                        false,

                    error:
                        "Upload session not found"

                });

            }

            const cleanFileName =
                path.basename(
                    String(
                        fileName
                    )
                );

            const relativeDirectory =
                String(
                    relativePath || ""
                )
                    .replace(
                        /\\/g,
                        "/"
                    )
                    .replace(
                        /^\/+/,
                        ""
                    );

            const finalRelativePath =
                relativeDirectory
                    ? path.posix.join(
                        relativeDirectory,
                        cleanFileName
                    )
                    : cleanFileName;

            const finalPath =
                safePath(
                    finalRelativePath
                );

            await fs.promises.mkdir(
                path.dirname(
                    finalPath
                ),
                {
                    recursive:
                        true
                }
            );

            let targetPath =
                finalPath;

            if (
                fs.existsSync(
                    targetPath
                )
            ) {

                const extension =
                    path.extname(
                        targetPath
                    );

                const base =
                    path.basename(
                        targetPath,
                        extension
                    );

                targetPath =
                    path.join(
                        path.dirname(
                            targetPath
                        ),
                        `${base}-${Date.now()}${extension}`
                    );

            }

            const output =
                fs.createWriteStream(
                    targetPath
                );

            try {

                for (
                    let i = 0;
                    i < total;
                    i++
                ) {

                    const chunkPath =
                        path.join(
                            uploadDirectory,
                            `${i}.chunk`
                        );

                    if (
                        !fs.existsSync(
                            chunkPath
                        )
                    ) {

                        output.destroy();

                        try {

                            await fs.promises.unlink(
                                targetPath
                            );

                        } catch {}

                        return res.status(400).json({

                            success:
                                false,

                            error:
                                `Missing chunk ${i}`

                        });

                    }

                    const chunk =
                        await fs.promises.readFile(
                            chunkPath
                        );

                    await new Promise(
                        (
                            resolve,
                            reject
                        ) => {

                            output.write(
                                chunk,
                                error => {

                                    if (
                                        error
                                    ) {

                                        reject(
                                            error
                                        );

                                    } else {

                                        resolve();

                                    }

                                }
                            );

                        }
                    );

                }

                await new Promise(
                    (
                        resolve,
                        reject
                    ) => {

                        output.end(
                            error => {

                                if (
                                    error
                                ) {

                                    reject(
                                        error
                                    );

                                } else {

                                    resolve();

                                }

                            }
                        );

                    }
                );

            } catch (error) {

                output.destroy();

                try {

                    await fs.promises.unlink(
                        targetPath
                    );

                } catch {}

                throw error;

            }

            await fs.promises.rm(
                uploadDirectory,
                {
                    recursive:
                        true,
                    force:
                        true
                }
            );

            const finalStats =
                await fs.promises.stat(
                    targetPath
                );

            const savedPath =
                relativeStoragePath(
                    targetPath
                );

            res.json({

                success:
                    true,

                message:
                    "File uploaded successfully",

                path:
                    savedPath,

                size:
                    finalStats.size

            });

        } catch (error) {

            console.error(
                "Complete upload error:",
                error
            );

            res.status(500).json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// CANCEL UPLOAD
// ============================================================

app.delete(
    "/api/upload/:uploadId",
    async (req, res) => {

        try {

            const uploadId =
                String(
                    req.params.uploadId || ""
                );

            if (
                !/^[a-zA-Z0-9_-]{8,100}$/
                    .test(
                        uploadId
                    )
            ) {

                return res.status(400).json({

                    success:
                        false,

                    error:
                        "Invalid upload ID"

                });

            }

            const uploadDirectory =
                path.join(
                    TEMP_DIR,
                    uploadId
                );

            await fs.promises.rm(
                uploadDirectory,
                {
                    recursive:
                        true,
                    force:
                        true
                }
            );

            res.json({

                success:
                    true,

                message:
                    "Upload cancelled"

            });

        } catch (error) {

            res.status(500).json({

                success:
                    false,

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// REMOTE DEVICE ROUTES
// ============================================================

registerRemoteRoutes(
    app
);


// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "GLOBAL ERROR:",
            error
        );

        if (
            res.headersSent
        ) {

            return next(
                error
            );

        }

        res.status(500).json({

            success:
                false,

            error:
                "Internal server error"

        });

    }
);


// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "======================================"
        );

        console.log(
            "☁️ CLOUD VAULT PRO SERVER"
        );

        console.log(
            "======================================"
        );

        console.log(
            "Port:",
            PORT
        );

        console.log(
            "Public:",
            PUBLIC_DIR
        );

        console.log(
            "Storage:",
            STORAGE_ROOT
        );

        console.log(
            "Files:",
            FILES_DIR
        );

        console.log(
            "Chunks:",
            TEMP_DIR
        );

        console.log(
            "Chunk size:",
            "5 MB"
        );

        console.log(
            "Maximum file:",
            "20 GB"
        );

        console.log(
            "API authentication:",
            API_KEY
                ? "ENABLED"
                : "NOT CONFIGURED"
        );

        console.log(
            "======================================"
        );

    }
);
