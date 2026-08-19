const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;

// ----------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------

const API_KEY =
    process.env.API_KEY || "CHANGE_THIS_SECRET_KEY";

const STORAGE_ROOT =
    process.env.STORAGE_PATH || "/data/cloud-vault";

const FILES_DIR =
    path.join(STORAGE_ROOT, "files");

const TEMP_DIR =
    path.join(STORAGE_ROOT, "chunks");

// ----------------------------------------------------
// CREATE STORAGE DIRECTORIES
// ----------------------------------------------------

fs.mkdirSync(FILES_DIR, {
    recursive: true
});

fs.mkdirSync(TEMP_DIR, {
    recursive: true
});

// ----------------------------------------------------
// MIDDLEWARE
// ----------------------------------------------------

app.use(cors());

app.use(express.json({
    limit: "20mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "20mb"
}));

// ----------------------------------------------------
// SECURITY
// ----------------------------------------------------

function authenticate(req, res, next) {

    const key =
        req.headers["x-api-key"];

    if (!key || key !== API_KEY) {

        return res.status(401).json({
            success: false,
            error: "Unauthorized"
        });
    }

    next();
}

// ----------------------------------------------------
// SAFE PATH
// ----------------------------------------------------

function safePath(relativePath) {

    if (!relativePath) {
        return FILES_DIR;
    }

    const normalized =
        path.normalize(relativePath)
            .replace(/^(\.\.(\/|\\|$))+/, "");

    const fullPath =
        path.join(FILES_DIR, normalized);

    const root =
        path.resolve(FILES_DIR);

    const target =
        path.resolve(fullPath);

    if (
        target !== root &&
        !target.startsWith(root + path.sep)
    ) {
        throw new Error("Invalid path");
    }

    return target;
}

// ----------------------------------------------------
// HEALTH CHECK
// ----------------------------------------------------

app.get("/", (req, res) => {

    res.json({
        success: true,
        service: "Cloud Vault Pro",
        status: "online",
        version: "1.0.0"
    });
});

// ----------------------------------------------------
// SERVER STATUS
// ----------------------------------------------------

app.get(
    "/api/status",
    authenticate,
    (req, res) => {

        res.json({
            success: true,
            status: "online",
            storage: STORAGE_ROOT,
            timestamp: new Date().toISOString()
        });
    }
);

// ----------------------------------------------------
// LIST FILES AND FOLDERS
// ----------------------------------------------------

app.get(
    "/api/files",
    authenticate,
    async (req, res) => {

        try {

            const requestedPath =
                req.query.path || "";

            const directory =
                safePath(requestedPath);

            if (!fs.existsSync(directory)) {

                return res.status(404).json({
                    success: false,
                    error: "Folder not found"
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

            for (const entry of entries) {

                const relativePath =
                    path.relative(
                        FILES_DIR,
                        path.join(
                            directory,
                            entry.name
                        )
                    );

                const fullPath =
                    path.join(
                        directory,
                        entry.name
                    );

                let size = 0;
                let modified = null;

                try {

                    const stats =
                        await fs.promises.stat(
                            fullPath
                        );

                    size =
                        entry.isFile()
                            ? stats.size
                            : 0;

                    modified =
                        stats.mtime.toISOString();

                } catch (_) {}

                result.push({
                    name: entry.name,
                    type: entry.isDirectory()
                        ? "folder"
                        : "file",
                    size,
                    modified,
                    path: relativePath
                });
            }

            result.sort((a, b) => {

                if (a.type !== b.type) {
                    return a.type === "folder"
                        ? -1
                        : 1;
                }

                return a.name.localeCompare(
                    b.name
                );
            });

            res.json({
                success: true,
                path: requestedPath,
                items: result
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// ----------------------------------------------------
// CREATE FOLDER
// ----------------------------------------------------

app.post(
    "/api/folder",
    authenticate,
    async (req, res) => {

        try {

            const folderPath =
                req.body.path;

            if (!folderPath) {

                return res.status(400).json({
                    success: false,
                    error: "Folder path required"
                });
            }

            const directory =
                safePath(folderPath);

            await fs.promises.mkdir(
                directory,
                {
                    recursive: true
                }
            );

            res.json({
                success: true,
                message: "Folder created",
                path: folderPath
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// ----------------------------------------------------
// DOWNLOAD FILE
// ----------------------------------------------------

app.get(
    "/api/download",
    authenticate,
    async (req, res) => {

        try {

            const filePath =
                req.query.path;

            if (!filePath) {

                return res.status(400).json({
                    success: false,
                    error: "File path required"
                });
            }

            const fullPath =
                safePath(filePath);

            if (!fs.existsSync(fullPath)) {

                return res.status(404).json({
                    success: false,
                    error: "File not found"
                });
            }

            const stats =
                await fs.promises.stat(
                    fullPath
                );

            if (!stats.isFile()) {

                return res.status(400).json({
                    success: false,
                    error: "Not a file"
                });
            }

            res.download(
                fullPath,
                path.basename(fullPath)
            );

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// ----------------------------------------------------
// DELETE FILE OR FOLDER
// ----------------------------------------------------

app.delete(
    "/api/files",
    authenticate,
    async (req, res) => {

        try {

            const targetPath =
                req.body.path ||
                req.query.path;

            if (!targetPath) {

                return res.status(400).json({
                    success: false,
                    error: "Path required"
                });
            }

            const fullPath =
                safePath(targetPath);

            if (!fs.existsSync(fullPath)) {

                return res.status(404).json({
                    success: false,
                    error: "File or folder not found"
                });
            }

            const resolvedRoot =
                path.resolve(FILES_DIR);

            const resolvedTarget =
                path.resolve(fullPath);

            if (
                resolvedTarget === resolvedRoot
            ) {

                return res.status(403).json({
                    success: false,
                    error: "Root storage cannot be deleted"
                });
            }

            await fs.promises.rm(
                fullPath,
                {
                    recursive: true,
                    force: true
                }
            );

            res.json({
                success: true,
                message: "Deleted successfully",
                path: targetPath
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// ----------------------------------------------------
// CHUNK UPLOAD
// ----------------------------------------------------

app.post(
    "/api/upload/chunk",
    authenticate,
    async (req, res) => {

        try {

            const {
                uploadId,
                fileName,
                relativePath,
                chunkIndex,
                totalChunks,
                data
            } = req.body;

            if (
                !uploadId ||
                !fileName ||
                !data ||
                chunkIndex === undefined ||
                !totalChunks
            ) {

                return res.status(400).json({
                    success: false,
                    error: "Missing upload information"
                });
            }

            if (
                !/^[a-zA-Z0-9_-]+$/.test(
                    uploadId
                )
            ) {

                return res.status(400).json({
                    success: false,
                    error: "Invalid upload ID"
                });
            }

            const uploadDirectory =
                path.join(
                    TEMP_DIR,
                    uploadId
                );

            await fs.promises.mkdir(
                uploadDirectory,
                {
                    recursive: true
                }
            );

            const chunkFile =
                path.join(
                    uploadDirectory,
                    `${chunkIndex}.chunk`
                );

            const buffer =
                Buffer.from(
                    data,
                    "base64"
                );

            await fs.promises.writeFile(
                chunkFile,
                buffer
            );

            res.json({
                success: true,
                uploadId,
                chunkIndex,
                totalChunks,
                message: "Chunk uploaded"
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// ----------------------------------------------------
// COMPLETE CHUNK UPLOAD
// ----------------------------------------------------

app.post(
    "/api/upload/complete",
    authenticate,
    async (req, res) => {

        try {

            const {
                uploadId,
                fileName,
                relativePath,
                totalChunks
            } = req.body;

            if (
                !uploadId ||
                !fileName ||
                !totalChunks
            ) {

                return res.status(400).json({
                    success: false,
                    error: "Missing upload information"
                });
            }

            const uploadDirectory =
                path.join(
                    TEMP_DIR,
                    uploadId
                );

            if (
                !fs.existsSync(
                    uploadDirectory
                )
            ) {

                return res.status(404).json({
                    success: false,
                    error: "Upload session not found"
                });
            }

            const finalRelativePath =
                relativePath
                    ? path.join(
                        relativePath,
                        fileName
                    )
                    : fileName;

            const finalPath =
                safePath(
                    finalRelativePath
                );

            await fs.promises.mkdir(
                path.dirname(finalPath),
                {
                    recursive: true
                }
            );

            const output =
                fs.createWriteStream(
                    finalPath
                );

            try {

                for (
                    let i = 0;
                    i < Number(totalChunks);
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

                        return res.status(400).json({
                            success: false,
                            error:
                                `Missing chunk ${i}`
                        });
                    }

                    const chunk =
                        await fs.promises.readFile(
                            chunkPath
                        );

                    await new Promise(
                        (resolve, reject) => {

                            output.write(
                                chunk,
                                error => {

                                    if (error) {
                                        reject(error);
                                    } else {
                                        resolve();
                                    }
                                }
                            );
                        }
                    );
                }

                await new Promise(
                    resolve => {
                        output.end(resolve);
                    }
                );

            } catch (error) {

                output.destroy();

                throw error;
            }

            await fs.promises.rm(
                uploadDirectory,
                {
                    recursive: true,
                    force: true
                }
            );

            res.json({
                success: true,
                message: "File uploaded successfully",
                path: finalRelativePath
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// ----------------------------------------------------
// CANCEL UPLOAD
// ----------------------------------------------------

app.delete(
    "/api/upload/:uploadId",
    authenticate,
    async (req, res) => {

        try {

            const uploadId =
                req.params.uploadId;

            if (
                !/^[a-zA-Z0-9_-]+$/.test(
                    uploadId
                )
            ) {

                return res.status(400).json({
                    success: false,
                    error: "Invalid upload ID"
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
                    recursive: true,
                    force: true
                }
            );

            res.json({
                success: true,
                message: "Upload cancelled"
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// ----------------------------------------------------
// GLOBAL ERROR HANDLER
// ----------------------------------------------------

app.use(
    (error, req, res, next) => {

        console.error(
            "Server error:",
            error
        );

        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
);

// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Cloud Vault Pro running on port ${PORT}`
        );

        console.log(
            `Storage directory: ${FILES_DIR}`
        );
    }
);
