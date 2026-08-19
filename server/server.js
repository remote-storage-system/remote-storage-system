const express = require("express");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const app = express();

const PORT = Number(process.env.PORT || 10000);

/*
========================================================
REMOTE STORAGE SERVER
========================================================

Storage APK
    ↓
    uploads files/chunks
    ↓
SERVER
    ↓
Controller APK
    ↓
    list / download / delete / rename

IMPORTANT:
Set VAULT_TOKEN in Render Environment Variables.
Example:

VAULT_TOKEN=your-long-random-secret-token

Do NOT put the real token inside this source code.
========================================================
*/


// ======================================================
// CONFIGURATION
// ======================================================

const STORAGE_DIR =
    process.env.STORAGE_DIR ||
    path.join(__dirname, "storage");

const TEMP_DIR =
    path.join(
        STORAGE_DIR,
        ".uploading"
    );

const CHUNK_SIZE =
    5 * 1024 * 1024; // 5 MB

const MAX_FILE_SIZE =
    20 *
    1024 *
    1024 *
    1024; // 20 GB

const MAX_STORAGE =
    Number(
        process.env.MAX_STORAGE_BYTES ||
        (
            50 *
            1024 *
            1024 *
            1024
        )
    );

const VAULT_TOKEN =
    process.env.VAULT_TOKEN ||
    "";


// ======================================================
// CREATE DIRECTORIES
// ======================================================

async function createDirectories() {

    await fsp.mkdir(
        STORAGE_DIR,
        {
            recursive: true
        }
    );

    await fsp.mkdir(
        TEMP_DIR,
        {
            recursive: true
        }
    );
}


// ======================================================
// AUTHENTICATION
// ======================================================

function authenticate(
    req,
    res,
    next
) {

    /*
    During local testing, if VAULT_TOKEN
    is not configured, authentication is disabled.

    On Render ALWAYS configure VAULT_TOKEN.
    */

    if (!VAULT_TOKEN) {

        return next();

    }

    const header =
        String(
            req.headers.authorization ||
            ""
        );

    const prefix =
        "Bearer ";

    if (
        !header.startsWith(prefix)
    ) {

        return res
            .status(401)
            .json({
                error:
                    "Authentication required"
            });

    }

    const token =
        header
            .slice(prefix.length)
            .trim();

    if (
        token !==
        VAULT_TOKEN
    ) {

        return res
            .status(403)
            .json({
                error:
                    "Invalid authentication token"
            });

    }

    next();
}


// ======================================================
// SAFE PATH
// ======================================================

function cleanPath(
    value
) {

    return String(
        value || ""
    )
        .replace(
            /\\/g,
            "/"
        )
        .split("/")
        .filter(
            part =>
                part &&
                part !== "." &&
                part !== ".."
        )
        .map(
            part =>
                part.replace(
                    /[<>:"|?*\x00-\x1F]/g,
                    "_"
                )
        )
        .join("/");
}


// ======================================================
// SAFE STORAGE PATH
// ======================================================

function resolveStoragePath(
    relativePath
) {

    const clean =
        cleanPath(
            relativePath
        );

    if (!clean) {

        throw new Error(
            "Invalid path"
        );

    }

    const root =
        path.resolve(
            STORAGE_DIR
        );

    const full =
        path.resolve(
            root,
            clean
        );

    if (
        full !== root &&
        !full.startsWith(
            root + path.sep
        )
    ) {

        throw new Error(
            "Invalid path"
        );

    }

    return full;
}


// ======================================================
// FORMAT BYTES
// ======================================================

function formatBytes(
    bytes
) {

    if (
        !Number.isFinite(bytes) ||
        bytes <= 0
    ) {

        return "0 B";

    }

    const units = [
        "B",
        "KB",
        "MB",
        "GB",
        "TB"
    ];

    const index =
        Math.min(
            units.length - 1,
            Math.floor(
                Math.log(bytes) /
                Math.log(1024)
            )
        );

    return (
        (
            bytes /
            Math.pow(
                1024,
                index
            )
        ).toFixed(
            index === 0
                ? 0
                : 2
        )
        +
        " "
        +
        units[index]
    );
}


// ======================================================
// MIME TYPE
// ======================================================

function getMimeType(
    filePath
) {

    const ext =
        path.extname(
            filePath
        ).toLowerCase();

    const types = {

        ".jpg":
            "image/jpeg",

        ".jpeg":
            "image/jpeg",

        ".png":
            "image/png",

        ".gif":
            "image/gif",

        ".webp":
            "image/webp",

        ".bmp":
            "image/bmp",

        ".svg":
            "image/svg+xml",

        ".mp4":
            "video/mp4",

        ".webm":
            "video/webm",

        ".mkv":
            "video/x-matroska",

        ".mov":
            "video/quicktime",

        ".avi":
            "video/x-msvideo",

        ".mp3":
            "audio/mpeg",

        ".wav":
            "audio/wav",

        ".m4a":
            "audio/mp4",

        ".aac":
            "audio/aac",

        ".ogg":
            "audio/ogg",

        ".flac":
            "audio/flac",

        ".pdf":
            "application/pdf",

        ".zip":
            "application/zip",

        ".rar":
            "application/vnd.rar",

        ".7z":
            "application/x-7z-compressed",

        ".txt":
            "text/plain",

        ".json":
            "application/json",

        ".doc":
            "application/msword",

        ".docx":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

        ".xls":
            "application/vnd.ms-excel",

        ".xlsx":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    };

    return (
        types[ext] ||
        "application/octet-stream"
    );
}


// ======================================================
// CALCULATE STORAGE
// ======================================================

async function calculateStorage() {

    let total = 0;

    async function scan(
        directory
    ) {

        let entries;

        try {

            entries =
                await fsp.readdir(
                    directory,
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

            if (
                entry.name ===
                ".uploading"
            ) {

                continue;

            }

            const full =
                path.join(
                    directory,
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
                        await fsp.stat(
                            full
                        );

                    total +=
                        stat.size;

                } catch {}

            }

        }

    }

    await scan(
        STORAGE_DIR
    );

    return total;
}


// ======================================================
// STATIC HEALTH PAGE
// ======================================================

app.get(
    "/",
    (req, res) => {

        res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Remote Storage Server</title>

<style>

body{
    margin:0;
    padding:30px;
    background:#070b14;
    color:white;
    font-family:system-ui,sans-serif;
}

.card{
    max-width:600px;
    margin:auto;
    padding:25px;
    border-radius:20px;
    background:#111827;
    border:1px solid #263244;
}

h1{
    margin-top:0;
}

.ok{
    color:#34d399;
}

.info{
    color:#94a3b8;
    line-height:1.7;
}

</style>
</head>

<body>

<div class="card">

<h1>☁️ Remote Storage</h1>

<p class="ok">
● Server Online
</p>

<div class="info">

<p>
This server is ready for the
Remote Storage Android application.
</p>

<p>
Storage API: Online
</p>

<p>
Remote Controller API: Online
</p>

</div>

</div>

</body>
</html>
        `);

    }
);


// ======================================================
// HEALTH API
// ======================================================

app.get(
    "/api/health",
    (req, res) => {

        res.json({

            ok: true,

            service:
                "remote-storage",

            time:
                new Date().toISOString()

        });

    }
);


// ======================================================
// AUTHENTICATED ROUTES
// ======================================================

app.use(
    "/api",
    authenticate
);


// ======================================================
// STORAGE INFORMATION
// ======================================================

app.get(
    "/api/storage",
    async (req, res) => {

        try {

            const used =
                await calculateStorage();

            const free =
                Math.max(
                    0,
                    MAX_STORAGE -
                    used
                );

            res.json({

                used,

                usedText:
                    formatBytes(
                        used
                    ),

                total:
                    MAX_STORAGE,

                totalText:
                    formatBytes(
                        MAX_STORAGE
                    ),

                free,

                freeText:
                    formatBytes(
                        free
                    ),

                percent:
                    MAX_STORAGE > 0
                        ? Math.min(
                            100,
                            (
                                used /
                                MAX_STORAGE
                            ) *
                            100
                        )
                        : 0

            });

        } catch (error) {

            res
                .status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


// ======================================================
// FILE LIST
// ======================================================

app.get(
    "/api/files",
    async (req, res) => {

        async function scan(
            directory,
            relative = ""
        ) {

            let entries;

            try {

                entries =
                    await fsp.readdir(
                        directory,
                        {
                            withFileTypes: true
                        }
                    );

            } catch {

                return [];

            }

            const result = [];

            for (
                const entry of entries
            ) {

                if (
                    entry.name ===
                    ".uploading"
                ) {

                    continue;

                }

                const fullPath =
                    path.join(
                        directory,
                        entry.name
                    );

                const relativePath =
                    path
                        .join(
                            relative,
                            entry.name
                        )
                        .replace(
                            /\\/g,
                            "/"
                        );

                if (
                    entry.isDirectory()
                ) {

                    result.push({

                        type:
                            "folder",

                        name:
                            relativePath,

                        size:
                            0,

                        sizeText:
                            "-"

                    });

                    const children =
                        await scan(
                            fullPath,
                            relativePath
                        );

                    result.push(
                        ...children
                    );

                } else {

                    try {

                        const stat =
                            await fsp.stat(
                                fullPath
                            );

                        result.push({

                            type:
                                "file",

                            name:
                                relativePath,

                            size:
                                stat.size,

                            sizeText:
                                formatBytes(
                                    stat.size
                                ),

                            modified:
                                stat.mtime
                                    .toISOString(),

                            mime:
                                getMimeType(
                                    fullPath
                                )

                        });

                    } catch {}

                }

            }

            return result;

        }

        try {

            const files =
                await scan(
                    STORAGE_DIR
                );

            res.json(
                files
            );

        } catch (error) {

            console.error(
                "List error:",
                error
            );

            res
                .status(500)
                .json({

                    error:
                        "Could not list files"

                });

        }

    }
);


// ======================================================
// CHECK IF FILE EXISTS
// ======================================================

app.get(
    "/api/file-info",
    async (req, res) => {

        try {

            const relative =
                cleanPath(
                    req.query.path
                );

            if (!relative) {

                return res
                    .status(400)
                    .json({
                        error:
                            "Path required"
                    });

            }

            const filePath =
                resolveStoragePath(
                    relative
                );

            const stat =
                await fsp.stat(
                    filePath
                );

            res.json({

                name:
                    relative,

                size:
                    stat.size,

                sizeText:
                    formatBytes(
                        stat.size
                    ),

                type:
                    stat.isDirectory()
                        ? "folder"
                        : "file",

                modified:
                    stat.mtime.toISOString(),

                mime:
                    getMimeType(
                        filePath
                    )

            });

        } catch (error) {

            res
                .status(404)
                .json({

                    error:
                        "File not found"

                });

        }

    }
);


// ======================================================
// CHUNK UPLOAD
// ======================================================

app.post(
    "/api/upload-chunk",
    async (req, res) => {

        let temporaryChunk = null;

        try {

            const id =
                String(
                    req.query.id ||
                    ""
                );

            const index =
                Number(
                    req.query.index
                );

            const total =
                Number(
                    req.query.total
                );

            const fileSize =
                Number(
                    req.query.size
                );

            const fileName =
                String(
                    req.query.name ||
                    "file"
                );

            const relativePath =
                String(
                    req.query.relativePath ||
                    fileName
                );


            // ------------------------------------------
            // VALIDATION
            // ------------------------------------------

            if (
                !/^[a-zA-Z0-9_-]{8,100}$/
                    .test(id)
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Invalid upload ID"

                    });

            }

            if (
                !Number.isInteger(
                    index
                ) ||
                !Number.isInteger(
                    total
                ) ||
                total < 1 ||
                index < 0 ||
                index >= total
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Invalid chunk"

                    });

            }

            if (
                !Number.isSafeInteger(
                    fileSize
                ) ||
                fileSize < 1 ||
                fileSize >
                MAX_FILE_SIZE
            ) {

                return res
                    .status(413)
                    .json({

                        error:
                            "File exceeds 20 GB limit"

                    });

            }


            // ------------------------------------------
            // STORAGE QUOTA
            // ------------------------------------------

            const currentStorage =
                await calculateStorage();

            if (
                currentStorage +
                fileSize >
                MAX_STORAGE
            ) {

                return res
                    .status(413)
                    .json({

                        error:
                            "Storage limit reached",

                        used:
                            currentStorage,

                        available:
                            Math.max(
                                0,
                                MAX_STORAGE -
                                currentStorage
                            )

                    });

            }


            // ------------------------------------------
            // UPLOAD DIRECTORY
            // ------------------------------------------

            const uploadDir =
                path.join(
                    TEMP_DIR,
                    id
                );

            await fsp.mkdir(
                uploadDir,
                {
                    recursive: true
                }
            );


            const metadataPath =
                path.join(
                    uploadDir,
                    "metadata.json"
                );

            const partialPath =
                path.join(
                    uploadDir,
                    "file.partial"
                );


            // ------------------------------------------
            // LOAD / CREATE METADATA
            // ------------------------------------------

            let metadata;

            try {

                metadata =
                    JSON.parse(
                        await fsp.readFile(
                            metadataPath,
                            "utf8"
                        )
                    );

            } catch {

                metadata = {

                    id,

                    name:
                        fileName,

                    relativePath,

                    size:
                        fileSize,

                    total,

                    nextChunk:
                        0

                };

                await fsp.writeFile(
                    metadataPath,
                    JSON.stringify(
                        metadata,
                        null,
                        2
                    )
                );

            }


            // ------------------------------------------
            // VERIFY SAME UPLOAD
            // ------------------------------------------

            if (
                metadata.size !==
                fileSize ||
                metadata.total !==
                total
            ) {

                return res
                    .status(409)
                    .json({

                        error:
                            "Upload metadata mismatch"

                    });

            }


            // ------------------------------------------
            // DUPLICATE CHUNK
            // ------------------------------------------

            if (
                index <
                metadata.nextChunk
            ) {

                return res.json({

                    ok:
                        true,

                    alreadyReceived:
                        true,

                    nextChunk:
                        metadata.nextChunk,

                    done:
                        metadata.nextChunk >=
                        total

                });

            }


            // ------------------------------------------
            // SEQUENTIAL CHUNKS ONLY
            // ------------------------------------------

            if (
                index !==
                metadata.nextChunk
            ) {

                return res
                    .status(409)
                    .json({

                        error:
                            "Wrong chunk order",

                        nextChunk:
                            metadata.nextChunk

                    });

            }


            // ------------------------------------------
            // SAVE TEMP CHUNK
            // ------------------------------------------

            temporaryChunk =
                path.join(
                    uploadDir,
                    `chunk-${index}.tmp`
                );


            await new Promise(
                (
                    resolve,
                    reject
                ) => {

                    const output =
                        fs.createWriteStream(
                            temporaryChunk
                        );

                    let failed = false;

                    function fail(
                        error
                    ) {

                        if (
                            failed
                        ) {

                            return;

                        }

                        failed = true;

                        output.destroy();

                        reject(
                            error
                        );

                    }

                    req.on(
                        "error",
                        fail
                    );

                    req.on(
                        "aborted",
                        () => {

                            fail(
                                new Error(
                                    "Connection aborted"
                                )
                            );

                        }
                    );

                    output.on(
                        "error",
                        fail
                    );

                    output.on(
                        "finish",
                        () => {

                            if (
                                failed
                            ) {

                                return;

                            }

                            resolve();

                        }
                    );

                    req.pipe(
                        output
                    );

                }
            );


            // ------------------------------------------
            // VERIFY CHUNK SIZE
            // ------------------------------------------

            const chunkStat =
                await fsp.stat(
                    temporaryChunk
                );

            const expectedChunkSize =
                Math.min(
                    CHUNK_SIZE,
                    fileSize -
                    (
                        index *
                        CHUNK_SIZE
                    )
                );

            if (
                chunkStat.size !==
                expectedChunkSize
            ) {

                await fsp.unlink(
                    temporaryChunk
                ).catch(
                    () => {}
                );

                temporaryChunk =
                    null;

                return res
                    .status(400)
                    .json({

                        error:
                            "Chunk size mismatch",

                        expected:
                            expectedChunkSize,

                        received:
                            chunkStat.size

                    });

            }


            // ------------------------------------------
            // APPEND CHUNK
            // ------------------------------------------

            await new Promise(
                (
                    resolve,
                    reject
                ) => {

                    const input =
                        fs.createReadStream(
                            temporaryChunk
                        );

                    const output =
                        fs.createWriteStream(
                            partialPath,
                            {
                                flags:
                                    "a"
                            }
                        );

                    input.on(
                        "error",
                        reject
                    );

                    output.on(
                        "error",
                        reject
                    );

                    output.on(
                        "finish",
                        resolve
                    );

                    input.pipe(
                        output
                    );

                }
            );


            await fsp.unlink(
                temporaryChunk
            ).catch(
                () => {}
            );

            temporaryChunk =
                null;


            // ------------------------------------------
            // UPDATE METADATA
            // ------------------------------------------

            metadata.nextChunk =
                index + 1;

            await fsp.writeFile(
                metadataPath,
                JSON.stringify(
                    metadata,
                    null,
                    2
                )
            );


            // ------------------------------------------
            // NOT FINAL CHUNK
            // ------------------------------------------

            if (
                index !==
                total - 1
            ) {

                return res.json({

                    ok:
                        true,

                    done:
                        false,

                    nextChunk:
                        metadata.nextChunk

                });

            }


            // ------------------------------------------
            // FINAL FILE CHECK
            // ------------------------------------------

            const finalStat =
                await fsp.stat(
                    partialPath
                );

            if (
                finalStat.size !==
                fileSize
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Final file size mismatch",

                        expected:
                            fileSize,

                        received:
                            finalStat.size

                    });

            }


            // ------------------------------------------
            // SAFE FINAL PATH
            // ------------------------------------------

            const safeRelative =
                cleanPath(
                    relativePath
                ) ||
                cleanPath(
                    fileName
                );

            const finalPath =
                resolveStoragePath(
                    safeRelative
                );

            await fsp.mkdir(
                path.dirname(
                    finalPath
                ),
                {
                    recursive:
                        true
                }
            );


            // ------------------------------------------
            // DON'T OVERWRITE EXISTING FILE
            // ------------------------------------------

            let target =
                finalPath;

            try {

                await fsp.access(
                    target
                );

                const extension =
                    path.extname(
                        target
                    );

                const base =
                    path.basename(
                        target,
                        extension
                    );

                target =
                    path.join(
                        path.dirname(
                            target
                        ),
                        base +
                        "-" +
                        Date.now() +
                        extension
                    );

            } catch {

                // File does not exist.

            }


            // ------------------------------------------
            // MOVE FINAL FILE
            // ------------------------------------------

            await fsp.rename(
                partialPath,
                target
            );


            // ------------------------------------------
            // REMOVE TEMP DIRECTORY
            // ------------------------------------------

            await fsp.rm(
                uploadDir,
                {
                    recursive:
                        true,
                    force:
                        true
                }
            );


            const savedName =
                path
                    .relative(
                        STORAGE_DIR,
                        target
                    )
                    .replace(
                        /\\/g,
                        "/"
                    );


            console.log(
                "Upload completed:",
                savedName
            );


            return res.json({

                ok:
                    true,

                done:
                    true,

                name:
                    savedName,

                size:
                    finalStat.size,

                sizeText:
                    formatBytes(
                        finalStat.size
                    )

            });

        } catch (error) {

            if (
                temporaryChunk
            ) {

                await fsp.unlink(
                    temporaryChunk
                ).catch(
                    () => {}
                );

            }

            console.error(
                "Upload error:",
                error
            );

            if (
                error.message ===
                "Connection aborted"
            ) {

                return;

            }

            if (
                !res.headersSent
            ) {

                return res
                    .status(500)
                    .json({

                        error:
                            error.message ||
                            "Upload failed"

                    });

            }

        }

    }
);


// ======================================================
// DOWNLOAD
// ======================================================

app.get(
    "/api/download/*",
    async (req, res) => {

        try {

            const requested =
                req.params[0];

            const relative =
                cleanPath(
                    requested
                );

            if (!relative) {

                return res
                    .status(400)
                    .send(
                        "Invalid file"
                    );

            }

            const filePath =
                resolveStoragePath(
                    relative
                );

            let stat;

            try {

                stat =
                    await fsp.stat(
                        filePath
                    );

            } catch {

                return res
                    .status(404)
                    .send(
                        "File not found"
                    );

            }

            if (
                !stat.isFile()
            ) {

                return res
                    .status(404)
                    .send(
                        "File not found"
                    );

            }


            const mime =
                getMimeType(
                    filePath
                );

            const downloadName =
                path.basename(
                    filePath
                )
                .replace(
                    /"/g,
                    ""
                );


            res.setHeader(
                "Content-Type",
                mime
            );

            res.setHeader(
                "Accept-Ranges",
                "bytes"
            );

            res.setHeader(
                "Cache-Control",
                "no-cache, no-store"
            );

            res.setHeader(
                "Content-Disposition",
                `attachment; filename="${downloadName}"`
            );


            // ------------------------------------------
            // RANGE REQUEST
            // ------------------------------------------

            const range =
                req.headers.range;

            if (range) {

                const match =
                    range.match(
                        /bytes=(\d*)-(\d*)/
                    );

                if (!match) {

                    return res
                        .status(416)
                        .setHeader(
                            "Content-Range",
                            `bytes */${stat.size}`
                        )
                        .end();

                }

                let start =
                    match[1]
                        ? Number(
                            match[1]
                        )
                        : 0;

                let end =
                    match[2]
                        ? Number(
                            match[2]
                        )
                        : stat.size - 1;

                if (
                    !Number.isSafeInteger(
                        start
                    ) ||
                    !Number.isSafeInteger(
                        end
                    ) ||
                    start < 0 ||
                    end < start ||
                    start >= stat.size
                ) {

                    return res
                        .status(416)
                        .setHeader(
                            "Content-Range",
                            `bytes */${stat.size}`
                        )
                        .end();

                }

                end =
                    Math.min(
                        end,
                        stat.size - 1
                    );

                const length =
                    end -
                    start +
                    1;

                res.status(
                    206
                );

                res.setHeader(
                    "Content-Range",
                    `bytes ${start}-${end}/${stat.size}`
                );

                res.setHeader(
                    "Content-Length",
                    length
                );

                const stream =
                    fs.createReadStream(
                        filePath,
                        {
                            start,
                            end
                        }
                    );

                stream.on(
                    "error",
                    () => {

                        res.destroy();

                    }
                );

                return stream.pipe(
                    res
                );

            }


            // ------------------------------------------
            // FULL DOWNLOAD
            // ------------------------------------------

            res.setHeader(
                "Content-Length",
                stat.size
            );

            const stream =
                fs.createReadStream(
                    filePath
                );

            stream.on(
                "error",
                () => {

                    res.destroy();

                }
            );

            return stream.pipe(
                res
            );

        } catch (error) {

            console.error(
                "Download error:",
                error
            );

            if (
                !res.headersSent
            ) {

                return res
                    .status(500)
                    .send(
                        "Download error"
                    );

            }

            res.destroy();

        }

    }
);


// ======================================================
// DELETE FILE
// ======================================================

app.delete(
    "/api/files",
    express.json({
        limit:
            "1mb"
    }),
    async (req, res) => {

        try {

            const relative =
                cleanPath(
                    req.body?.name
                );

            if (!relative) {

                return res
                    .status(400)
                    .json({

                        error:
                            "File name required"

                    });

            }

            const filePath =
                resolveStoragePath(
                    relative
                );

            const stat =
                await fsp.stat(
                    filePath
                );

            if (
                !stat.isFile()
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Not a file"

                    });

            }

            await fsp.unlink(
                filePath
            );


            res.json({

                ok:
                    true,

                deleted:
                    relative

            });

        } catch (error) {

            console.error(
                "Delete error:",
                error
            );

            res
                .status(
                    error.code ===
                    "ENOENT"
                        ? 404
                        : 500
                )
                .json({

                    error:
                        error.message ||
                        "Delete failed"

                });

        }

    }
);


// ======================================================
// RENAME FILE
// ======================================================

app.post(
    "/api/rename",
    express.json({
        limit:
            "1mb"
    }),
    async (req, res) => {

        try {

            const oldName =
                cleanPath(
                    req.body?.oldName
                );

            const newName =
                cleanPath(
                    req.body?.newName
                );

            if (
                !oldName ||
                !newName
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Old and new names are required"

                    });

            }

            const oldPath =
                resolveStoragePath(
                    oldName
                );

            const newPath =
                resolveStoragePath(
                    newName
                );

            await fsp.stat(
                oldPath
            );


            try {

                await fsp.access(
                    newPath
                );

                return res
                    .status(409)
                    .json({

                        error:
                            "A file with that name already exists"

                    });

            } catch {

                // Target doesn't exist.

            }


            await fsp.mkdir(
                path.dirname(
                    newPath
                ),
                {
                    recursive:
                        true
                }
            );

            await fsp.rename(
                oldPath,
                newPath
            );


            res.json({

                ok:
                    true,

                oldName,

                newName

            });

        } catch (error) {

            console.error(
                "Rename error:",
                error
            );

            res
                .status(500)
                .json({

                    error:
                        error.message ||
                        "Rename failed"

                });

        }

    }
);


// ======================================================
// DELETE FOLDER
// ======================================================

app.delete(
    "/api/folder",
    express.json({
        limit:
            "1mb"
    }),
    async (req, res) => {

        try {

            const relative =
                cleanPath(
                    req.body?.name
                );

            if (!relative) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Folder name required"

                    });

            }

            const folderPath =
                resolveStoragePath(
                    relative
                );

            const stat =
                await fsp.stat(
                    folderPath
                );

            if (
                !stat.isDirectory()
            ) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Not a folder"

                    });

            }

            await fsp.rm(
                folderPath,
                {
                    recursive:
                        true,
                    force:
                        true
                }
            );


            res.json({

                ok:
                    true,

                deleted:
                    relative

            });

        } catch (error) {

            console.error(
                "Folder delete error:",
                error
            );

            res
                .status(500)
                .json({

                    error:
                        error.message ||
                        "Folder delete failed"

                });

        }

    }
);


// ======================================================
// CREATE FOLDER
// ======================================================

app.post(
    "/api/folder",
    express.json({
        limit:
            "1mb"
    }),
    async (req, res) => {

        try {

            const relative =
                cleanPath(
                    req.body?.name
                );

            if (!relative) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Folder name required"

                    });

            }

            const folderPath =
                resolveStoragePath(
                    relative
                );

            await fsp.mkdir(
                folderPath,
                {
                    recursive:
                        true
                }
            );


            res.json({

                ok:
                    true,

                name:
                    relative

            });

        } catch (error) {

            console.error(
                "Folder creation error:",
                error
            );

            res
                .status(500)
                .json({

                    error:
                        error.message ||
                        "Could not create folder"

                });

        }

    }
);


// ======================================================
// START SERVER
// ======================================================

createDirectories()
    .then(
        () => {

            app.listen(
                PORT,
                "0.0.0.0",
                () => {

                    console.log(
                        "================================="
                    );

                    console.log(
                        "Remote Storage Server"
                    );

                    console.log(
                        "================================="
                    );

                    console.log(
                        "Port:",
                        PORT
                    );

                    console.log(
                        "Storage:",
                        STORAGE_DIR
                    );

                    console.log(
                        "Maximum file:",
                        formatBytes(
                            MAX_FILE_SIZE
                        )
                    );

                    console.log(
                        "Maximum storage:",
                        formatBytes(
                            MAX_STORAGE
                        )
                    );

                    console.log(
                        "Authentication:",
                        VAULT_TOKEN
                            ? "ENABLED"
                            : "DISABLED"
                    );

                    console.log(
                        "================================="
                    );

                }
            );

        }
    )
    .catch(
        error => {

            console.error(
                "Startup error:",
                error
            );

            process.exit(
                1
            );

        }
    );
