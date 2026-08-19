const crypto = require("crypto");

const devices = new Map();
const pairingCodes = new Map();
const commands = new Map();

const PAIR_CODE_LIFETIME = 5 * 60 * 1000;
const DEVICE_TIMEOUT = 2 * 60 * 1000;

function randomId() {
    return crypto.randomBytes(18).toString("hex");
}

function randomPairCode() {
    return String(
        Math.floor(100000 + Math.random() * 900000)
    );
}

function cleanName(value) {
    return String(value || "Android Phone")
        .replace(/[<>"]/g, "")
        .slice(0, 100);
}

function cleanup() {

    const now = Date.now();

    for (const [code, data] of pairingCodes) {

        if (now - data.createdAt > PAIR_CODE_LIFETIME) {
            pairingCodes.delete(code);
        }

    }

    for (const [id, device] of devices) {

        if (now - device.lastSeen > DEVICE_TIMEOUT) {
            device.online = false;
        }

    }
}

setInterval(cleanup, 30000);

function registerRemoteRoutes(app) {

    // =====================================================
    // CREATE PAIRING CODE
    // =====================================================

    app.post(
        "/api/remote/pair/create",
        (req, res) => {

            const code = randomPairCode();

            pairingCodes.set(code, {
                code,
                createdAt: Date.now(),
                approved: false,
                deviceId: null
            });

            res.json({
                ok: true,
                code,
                expiresIn: PAIR_CODE_LIFETIME
            });
        }
    );


    // =====================================================
    // PAIRING STATUS
    // =====================================================

    app.get(
        "/api/remote/pair/status/:code",
        (req, res) => {

            const code =
                String(req.params.code || "");

            const pair =
                pairingCodes.get(code);

            if (!pair) {

                return res.status(404).json({
                    error: "Pairing code expired or invalid"
                });
            }

            if (
                Date.now() - pair.createdAt >
                PAIR_CODE_LIFETIME
            ) {

                pairingCodes.delete(code);

                return res.status(410).json({
                    error: "Pairing code expired"
                });
            }

            if (pair.approved) {

                return res.json({
                    status: "authorized",
                    deviceId: pair.deviceId
                });
            }

            res.json({
                status: "waiting"
            });
        }
    );


    // =====================================================
    // APK PAIR / AUTHORIZE
    // =====================================================

    app.post(
        "/api/remote/pair/authorize",
        (req, res) => {

            const code =
                String(req.body?.code || "");

            const deviceName =
                cleanName(
                    req.body?.deviceName
                );

            if (!/^\d{6}$/.test(code)) {

                return res.status(400).json({
                    error: "Invalid pairing code"
                });
            }

            const pair =
                pairingCodes.get(code);

            if (!pair) {

                return res.status(404).json({
                    error:
                        "Pairing code expired or invalid"
                });
            }

            const deviceId =
                randomId();

            const device = {

                id: deviceId,

                name: deviceName,

                online: true,

                createdAt: Date.now(),

                lastSeen: Date.now(),

                files: []

            };

            devices.set(
                deviceId,
                device
            );

            commands.set(
                deviceId,
                []
            );

            pair.approved = true;

            pair.deviceId =
                deviceId;

            res.json({

                ok: true,

                deviceId,

                message:
                    "Phone paired successfully"

            });
        }
    );


    // =====================================================
    // DEVICE HEARTBEAT
    // =====================================================

    app.post(
        "/api/remote/heartbeat",
        (req, res) => {

            const deviceId =
                String(
                    req.body?.deviceId || ""
                );

            const device =
                devices.get(deviceId);

            if (!device) {

                return res.status(404).json({
                    error: "Device not found"
                });
            }

            device.lastSeen =
                Date.now();

            device.online = true;

            res.json({
                ok: true
            });
        }
    );


    // =====================================================
    // DEVICE LIST
    // =====================================================

    app.get(
        "/api/remote/devices",
        (req, res) => {

            const list =
                Array.from(
                    devices.values()
                )
                .map(device => ({

                    id: device.id,

                    name: device.name,

                    online:
                        Date.now() -
                        device.lastSeen <
                        DEVICE_TIMEOUT,

                    lastSeen:
                        device.lastSeen,

                    fileCount:
                        Array.isArray(device.files)
                            ? device.files.length
                            : 0

                }));

            res.json(list);
        }
    );


    // =====================================================
    // DEVICE SEND FILE LIST
    // =====================================================

    app.post(
        "/api/remote/files/update",
        (req, res) => {

            const deviceId =
                String(
                    req.body?.deviceId || ""
                );

            const device =
                devices.get(deviceId);

            if (!device) {

                return res.status(404).json({
                    error: "Device not found"
                });
            }

            if (
                !Array.isArray(
                    req.body?.files
                )
            ) {

                return res.status(400).json({
                    error: "files must be an array"
                });
            }

            device.files =
                req.body.files
                    .slice(0, 10000)
                    .map(file => ({

                        id:
                            String(
                                file.id ||
                                randomId()
                            ),

                        name:
                            cleanName(
                                file.name
                            ),

                        path:
                            String(
                                file.path ||
                                ""
                            ).slice(0, 1000),

                        size:
                            Number(
                                file.size || 0
                            ),

                        sizeText:
                            String(
                                file.sizeText ||
                                ""
                            ),

                        type:
                            String(
                                file.type ||
                                "file"
                            )

                    }));

            device.lastSeen =
                Date.now();

            device.online = true;

            res.json({
                ok: true,
                count:
                    device.files.length
            });
        }
    );


    // =====================================================
    // GET REMOTE FILES
    // =====================================================

    app.get(
        "/api/remote/files/:deviceId",
        (req, res) => {

            const deviceId =
                String(
                    req.params.deviceId || ""
                );

            const device =
                devices.get(deviceId);

            if (!device) {

                return res.status(404).json({
                    error: "Device not found"
                });
            }

            res.json(
                device.files || []
            );
        }
    );


    // =====================================================
    // ADD COMMAND
    // =====================================================

    function addCommand(
        deviceId,
        command
    ) {

        const list =
            commands.get(deviceId);

        if (!list) {
            return false;
        }

        list.push({

            id: randomId(),

            ...command,

            createdAt:
                Date.now()

        });

        // Keep queue small
        if (list.length > 100) {
            list.splice(
                0,
                list.length - 100
            );
        }

        return true;
    }


    // =====================================================
    // REMOTE DOWNLOAD COMMAND
    // =====================================================

    app.post(
        "/api/remote/download",
        (req, res) => {

            const deviceId =
                String(
                    req.body?.deviceId || ""
                );

            const fileId =
                String(
                    req.body?.fileId || ""
                );

            if (!deviceId || !fileId) {

                return res.status(400).json({
                    error:
                        "deviceId and fileId required"
                });
            }

            const device =
                devices.get(deviceId);

            if (!device) {

                return res.status(404).json({
                    error:
                        "Device not found"
                });
            }

            const file =
                device.files.find(
                    item =>
                        item.id === fileId
                );

            if (!file) {

                return res.status(404).json({
                    error:
                        "File not found"
                });
            }

            addCommand(
                deviceId,
                {
                    type: "DOWNLOAD",
                    fileId: file.id,
                    path: file.path,
                    name: file.name
                }
            );

            res.json({
                ok: true,
                message:
                    "Download command queued"
            });
        }
    );


    // =====================================================
    // REMOTE DELETE COMMAND
    // =====================================================

    app.post(
        "/api/remote/delete",
        (req, res) => {

            const deviceId =
                String(
                    req.body?.deviceId || ""
                );

            const fileId =
                String(
                    req.body?.fileId || ""
                );

            if (!deviceId || !fileId) {

                return res.status(400).json({
                    error:
                        "deviceId and fileId required"
                });
            }

            const device =
                devices.get(deviceId);

            if (!device) {

                return res.status(404).json({
                    error:
                        "Device not found"
                });
            }

            const file =
                device.files.find(
                    item =>
                        item.id === fileId
                );

            if (!file) {

                return res.status(404).json({
                    error:
                        "File not found"
                });
            }

            addCommand(
                deviceId,
                {
                    type: "DELETE",
                    fileId: file.id,
                    path: file.path,
                    name: file.name
                }
            );

            res.json({
                ok: true,
                message:
                    "Delete command queued"
            });
        }
    );


    // =====================================================
    // APK POLLS FOR COMMANDS
    // =====================================================

    app.get(
        "/api/remote/commands/:deviceId",
        (req, res) => {

            const deviceId =
                String(
                    req.params.deviceId || ""
                );

            const device =
                devices.get(deviceId);

            if (!device) {

                return res.status(404).json({
                    error:
                        "Device not found"
                });
            }

            device.lastSeen =
                Date.now();

            device.online = true;

            const list =
                commands.get(deviceId) || [];

            res.json({
                commands: list
            });

            commands.set(
                deviceId,
                []
            );
        }
    );


    // =====================================================
    // COMMAND RESULT
    // =====================================================

    app.post(
        "/api/remote/command-result",
        (req, res) => {

            const deviceId =
                String(
                    req.body?.deviceId || ""
                );

            const commandId =
                String(
                    req.body?.commandId || ""
                );

            const success =
                Boolean(
                    req.body?.success
                );

            const device =
                devices.get(deviceId);

            if (!device) {

                return res.status(404).json({
                    error:
                        "Device not found"
                });
            }

            device.lastSeen =
                Date.now();

            device.online = true;

            console.log(
                "Remote command result:",
                {
                    deviceId,
                    commandId,
                    success
                }
            );

            res.json({
                ok: true
            });
        }
    );


    // =====================================================
    // DISCONNECT DEVICE
    // =====================================================

    app.post(
        "/api/remote/disconnect",
        (req, res) => {

            const deviceId =
                String(
                    req.body?.deviceId || ""
                );

            if (!devices.has(deviceId)) {

                return res.status(404).json({
                    error:
                        "Device not found"
                });
            }

            devices.delete(deviceId);

            commands.delete(
                deviceId
            );

            res.json({
                ok: true
            });
        }
    );

}

module.exports = {
    registerRemoteRoutes
};
