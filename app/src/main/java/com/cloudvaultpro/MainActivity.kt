package com.cloudvaultpro

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {

    // =========================================================
    // CLOUD VAULT SERVER
    // =========================================================

    private val SERVER_URL =
        "https://cloud-vault-server.onrender.com"

    // =========================================================
    // UI
    // =========================================================

    private lateinit var apiKeyInput: EditText
    private lateinit var pairingCodeInput: EditText

    private lateinit var statusText: TextView
    private lateinit var deviceText: TextView
    private lateinit var fileCountText: TextView

    private lateinit var connectButton: Button
    private lateinit var pairButton: Button
    private lateinit var storageButton: Button
    private lateinit var refreshButton: Button

    private lateinit var progress: ProgressBar

    // =========================================================
    // STORAGE
    // =========================================================

    private var selectedTreeUri: Uri? = null

    private val prefs by lazy {
        getSharedPreferences(
            "cloud_vault",
            MODE_PRIVATE
        )
    }

    private var apiKey: String = ""
    private var deviceId: String = ""

    // =========================================================
    // THREADING
    // =========================================================

    private val executor =
        Executors.newSingleThreadExecutor()

    private val mainHandler =
        Handler(Looper.getMainLooper())

    private val pollRunnable =
        object : Runnable {

            override fun run() {

                if (deviceId.isNotEmpty()) {

                    heartbeat()

                    pollCommands()
                }

                mainHandler.postDelayed(
                    this,
                    15_000
                )
            }
        }

    // =========================================================
    // STORAGE PICKER
    // =========================================================

    private val storagePicker =
        registerForActivityResult(
            ActivityResultContracts.OpenDocumentTree()
        ) { uri ->

            if (uri != null) {

                try {

                    contentResolver.takePersistableUriPermission(
                        uri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION or
                                Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                    )

                } catch (_: Exception) {
                }

                selectedTreeUri = uri

                prefs.edit()
                    .putString(
                        "storage_uri",
                        uri.toString()
                    )
                    .apply()

                updateStatus(
                    "Storage folder selected. Scanning..."
                )

                scanAndSyncFiles()
            }
        }

    // =========================================================
    // ON CREATE
    // =========================================================

    override fun onCreate(
        savedInstanceState: Bundle?
    ) {

        super.onCreate(
            savedInstanceState
        )

        setContentView(
            R.layout.activity_main
        )

        initializeViews()

        loadSavedData()

        startBackgroundLoop()

    }

    // =========================================================
    // INITIALIZE UI
    // =========================================================

    private fun initializeViews() {

        apiKeyInput =
            findViewById(
                R.id.apiKeyInput
            )

        pairingCodeInput =
            findViewById(
                R.id.pairingCodeInput
            )

        statusText =
            findViewById(
                R.id.statusText
            )

        deviceText =
            findViewById(
                R.id.deviceText
            )

        fileCountText =
            findViewById(
                R.id.fileCountText
            )

        connectButton =
            findViewById(
                R.id.connectButton
            )

        pairButton =
            findViewById(
                R.id.pairButton
            )

        storageButton =
            findViewById(
                R.id.storageButton
            )

        refreshButton =
            findViewById(
                R.id.refreshButton
            )

        progress =
            findViewById(
                R.id.progress
            )

        connectButton.setOnClickListener {

            apiKey =
                apiKeyInput
                    .text
                    .toString()
                    .trim()

            if (apiKey.isEmpty()) {

                toast(
                    "API Key डालिए"
                )

                return@setOnClickListener
            }

            prefs.edit()
                .putString(
                    "api_key",
                    apiKey
                )
                .apply()

            testServer()
        }

        pairButton.setOnClickListener {

            authorizePairing()
        }

        storageButton.setOnClickListener {

            storagePicker.launch(
                null
            )
        }

        refreshButton.setOnClickListener {

            scanAndSyncFiles()
        }

    }

    // =========================================================
    // LOAD SAVED DATA
    // =========================================================

    private fun loadSavedData() {

        apiKey =
            prefs.getString(
                "api_key",
                ""
            ) ?: ""

        deviceId =
            prefs.getString(
                "device_id",
                ""
            ) ?: ""

        val savedUri =
            prefs.getString(
                "storage_uri",
                ""
            )

        if (apiKey.isNotEmpty()) {

            apiKeyInput.setText(
                apiKey
            )
        }

        if (deviceId.isNotEmpty()) {

            deviceText.text =
                "Device ID:\n$deviceId"

        }

        if (!savedUri.isNullOrEmpty()) {

            try {

                selectedTreeUri =
                    Uri.parse(
                        savedUri
                    )

            } catch (_: Exception) {
            }

        }

    }

    // =========================================================
    // SERVER TEST
    // =========================================================

    private fun testServer() {

        showProgress(true)

        executor.execute {

            try {

                val result =
                    request(
                        method = "GET",
                        endpoint = "/api/status"
                    )

                runOnUiThread {

                    showProgress(false)

                    if (result.first in 200..299) {

                        updateStatus(
                            "🟢 Cloud Vault Server Connected"
                        )

                        toast(
                            "Server connected"
                        )

                    } else {

                        updateStatus(
                            "❌ Server error: ${result.second}"
                        )
                    }
                }

            } catch (e: Exception) {

                runOnUiThread {

                    showProgress(false)

                    updateStatus(
                        "❌ Connection failed: ${e.message}"
                    )
                }
            }
        }
    }

    // =========================================================
    // AUTHORIZE PAIRING
    // =========================================================

    private fun authorizePairing() {

        val code =
            pairingCodeInput
                .text
                .toString()
                .trim()

        if (code.length != 6) {

            toast(
                "6 digit pairing code डालिए"
            )

            return
        }

        if (apiKey.isEmpty()) {

            toast(
                "पहले API Key connect करें"
            )

            return
        }

        showProgress(true)

        executor.execute {

            try {

                val body =
                    JSONObject()

                body.put(
                    "code",
                    code
                )

                body.put(
                    "deviceName",
                    getDeviceName()
                )

                val result =
                    request(
                        method = "POST",
                        endpoint =
                            "/api/remote/pair/authorize",
                        body =
                            body.toString()
                    )

                runOnUiThread {

                    showProgress(false)

                    if (result.first in 200..299) {

                        val json =
                            JSONObject(
                                result.second
                            )

                        deviceId =
                            json.optString(
                                "deviceId"
                            )

                        prefs.edit()
                            .putString(
                                "device_id",
                                deviceId
                            )
                            .apply()

                        deviceText.text =
                            "📱 Connected\n\nDevice ID:\n$deviceId"

                        updateStatus(
                            "🟢 Phone paired successfully"
                        )

                        toast(
                            "Phone successfully paired"
                        )

                        if (selectedTreeUri != null) {

                            scanAndSyncFiles()
                        }

                    } else {

                        updateStatus(
                            "❌ Pair failed: ${result.second}"
                        )
                    }
                }

            } catch (e: Exception) {

                runOnUiThread {

                    showProgress(false)

                    updateStatus(
                        "❌ ${e.message}"
                    )
                }
            }
        }
    }

    // =========================================================
    // HEARTBEAT
    // =========================================================

    private fun heartbeat() {

        if (
            apiKey.isEmpty() ||
            deviceId.isEmpty()
        ) {
            return
        }

        executor.execute {

            try {

                val body =
                    JSONObject()

                body.put(
                    "deviceId",
                    deviceId
                )

                request(
                    method = "POST",
                    endpoint =
                        "/api/remote/heartbeat",
                    body =
                        body.toString()
                )

            } catch (_: Exception) {
            }
        }
    }

    // =========================================================
    // POLL REMOTE COMMANDS
    // =========================================================

    private fun pollCommands() {

        if (
            apiKey.isEmpty() ||
            deviceId.isEmpty()
        ) {
            return
        }

        executor.execute {

            try {

                val result =
                    request(
                        method = "GET",
                        endpoint =
                            "/api/remote/commands/" +
                                    deviceId
                    )

                if (
                    result.first !in 200..299
                ) {
                    return@execute
                }

                val json =
                    JSONObject(
                        result.second
                    )

                val commands =
                    json.optJSONArray(
                        "commands"
                    )
                        ?: JSONArray()

                for (
                    i in 0 until commands.length()
                ) {

                    val command =
                        commands.getJSONObject(
                            i
                        )

                    executeRemoteCommand(
                        command
                    )
                }

            } catch (_: Exception) {
            }
        }
    }

    // =========================================================
    // EXECUTE COMMAND
    // =========================================================

    private fun executeRemoteCommand(
        command: JSONObject
    ) {

        val type =
            command.optString(
                "type"
            )

        val commandId =
            command.optString(
                "id"
            )

        val fileId =
            command.optString(
                "fileId"
            )

        val path =
            command.optString(
                "path"
            )

        var success =
            false

        var message =
            ""

        try {

            when (type) {

                "DELETE" -> {

                    success =
                        deleteLocalFile(
                            path
                        )

                    message =
                        if (success)
                            "File deleted"
                        else
                            "File not found"
                }

                "DOWNLOAD" -> {

                    /*
                     * DOWNLOAD command का अर्थ है:
                     * remote phone पर मौजूद file को
                     * इस phone की selected storage में
                     * उपलब्ध कराना।
                     *
                     * अभी server केवल command भेजता है।
                     * वास्तविक cross-device file transfer
                     * के लिए upload/download endpoint
                     * को भी जोड़ना पड़ेगा।
                     */

                    success =
                        false

                    message =
                        "Download command received; file transfer endpoint is not implemented yet"
                }

                else -> {

                    message =
                        "Unknown command"
                }
            }

        } catch (e: Exception) {

            success = false

            message =
                e.message ?: "Command failed"
        }

        sendCommandResult(
            commandId,
            success,
            message
        )

        if (type == "DELETE" && success) {

            runOnUiThread {

                toast(
                    "🗑️ Remote command: file deleted"
                )

                scanAndSyncFiles()
            }
        }

    }

    // =========================================================
    // DELETE LOCAL FILE
    // =========================================================

    private fun deleteLocalFile(
        relativePath: String
    ): Boolean {

        val root =
            selectedTreeUri
                ?: return false

        if (relativePath.isEmpty()) {

            return false
        }

        val parts =
            relativePath
                .replace(
                    "\\",
                    "/"
                )
                .split("/")
                .filter {
                    it.isNotBlank()
                }

        var current =
            DocumentFile.fromTreeUri(
                this,
                root
            )
                ?: return false

        for (
            part in parts
        ) {

            val next =
                current
                    .findFile(
                        part
                    )
                    ?: return false

            current =
                next
        }

        return try {

            current.delete()

        } catch (_: Exception) {

            false
        }
    }

    // =========================================================
    // COMMAND RESULT
    // =========================================================

    private fun sendCommandResult(
        commandId: String,
        success: Boolean,
        message: String
    ) {

        executor.execute {

            try {

                val body =
                    JSONObject()

                body.put(
                    "deviceId",
                    deviceId
                )

                body.put(
                    "commandId",
                    commandId
                )

                body.put(
                    "success",
                    success
                )

                body.put(
                    "message",
                    message
                )

                request(
                    method = "POST",
                    endpoint =
                        "/api/remote/command-result",
                    body =
                        body.toString()
                )

            } catch (_: Exception) {
            }
        }
    }

    // =========================================================
    // SCAN STORAGE
    // =========================================================

    private fun scanAndSyncFiles() {

        val root =
            selectedTreeUri

        if (root == null) {

            runOnUiThread {

                updateStatus(
                    "📂 पहले Storage Folder चुनें"
                )

            }

            return
        }

        if (deviceId.isEmpty()) {

            runOnUiThread {

                updateStatus(
                    "🔗 पहले phone pair करें"
                )

            }

            return
        }

        executor.execute {

            try {

                val rootDocument =
                    DocumentFile.fromTreeUri(
                        this,
                        root
                    )

                if (
                    rootDocument == null
                ) {

                    throw Exception(
                        "Storage folder unavailable"
                    )
                }

                val files =
                    JSONArray()

                scanDocumentTree(
                    rootDocument,
                    "",
                    files
                )

                val body =
                    JSONObject()

                body.put(
                    "deviceId",
                    deviceId
                )

                body.put(
                    "files",
                    files
                )

                val result =
                    request(
                        method = "POST",
                        endpoint =
                            "/api/remote/files/update",
                        body =
                            body.toString()
                    )

                runOnUiThread {

                    if (
                        result.first in 200..299
                    ) {

                        fileCountText.text =
                            "📦 Files synced: ${files.length()}"

                        updateStatus(
                            "🟢 Storage synced successfully"
                        )

                    } else {

                        updateStatus(
                            "❌ Sync failed: ${result.second}"
                        )
                    }
                }

            } catch (e: Exception) {

                runOnUiThread {

                    updateStatus(
                        "❌ Storage scan failed: ${e.message}"
                    )
                }
            }
        }
    }

    // =========================================================
    // RECURSIVE DOCUMENT TREE SCAN
    // =========================================================

    private fun scanDocumentTree(
        directory: DocumentFile,
        currentPath: String,
        output: JSONArray
    ) {

        val children =
            try {
                directory.listFiles()
            } catch (_: Exception) {
                emptyArray()
            }

        for (
            file in children
        ) {

            val name =
                file.name
                    ?: "Unnamed"

            val path =
                if (
                    currentPath.isEmpty()
                ) {

                    name

                } else {

                    "$currentPath/$name"
                }

            if (
                file.isDirectory
            ) {

                scanDocumentTree(
                    file,
                    path,
                    output
                )

            } else if (
                file.isFile
            ) {

                val item =
                    JSONObject()

                item.put(
                    "id",
                    createStableFileId(
                        path
                    )
                )

                item.put(
                    "name",
                    name
                )

                item.put(
                    "path",
                    path
                )

                item.put(
                    "size",
                    file.length()
                )

                item.put(
                    "sizeText",
                    formatBytes(
                        file.length()
                    )
                )

                item.put(
                    "type",
                    "file"
                )

                output.put(
                    item
                )
            }
        }
    }

    // =========================================================
    // FILE ID
    // =========================================================

    private fun createStableFileId(
        path: String
    ): String {

        return UUID.nameUUIDFromBytes(
            path.toByteArray()
        ).toString()
    }

    // =========================================================
    // DEVICE NAME
    // =========================================================

    private fun getDeviceName(): String {

        return "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"
            .trim()
    }

    // =========================================================
    // HTTP REQUEST
    // =========================================================

    private fun request(
        method: String,
        endpoint: String,
        body: String? = null
    ): Pair<Int, String> {

        val url =
            URL(
                SERVER_URL.trimEnd('/') +
                        endpoint
            )

        val connection =
            url.openConnection()
                    as HttpURLConnection

        connection.requestMethod =
            method

        connection.connectTimeout =
            30_000

        connection.readTimeout =
            30_000

        connection.useCaches =
            false

        connection.setRequestProperty(
            "Accept",
            "application/json"
        )

        if (apiKey.isNotEmpty()) {

            connection.setRequestProperty(
                "X-API-Key",
                apiKey
            )
        }

        if (body != null) {

            connection.doOutput =
                true

            connection.setRequestProperty(
                "Content-Type",
                "application/json"
            )

            connection.outputStream
                .use { output ->

                    output.write(
                        body.toByteArray(
                            Charsets.UTF_8
                        )
                    )
                }
        }

        val responseCode =
            connection.responseCode

        val stream =
            if (
                responseCode in 200..399
            ) {

                connection.inputStream

            } else {

                connection.errorStream
            }

        val response =
            if (stream != null) {

                BufferedReader(
                    InputStreamReader(
                        stream
                    )
                ).use {
                    it.readText()
                }

            } else {

                ""
            }

        connection.disconnect()

        return Pair(
            responseCode,
            response
        )
    }

    // =========================================================
    // UI HELPERS
    // =========================================================

    private fun updateStatus(
        message: String
    ) {

        statusText.text =
            message
    }

    private fun showProgress(
        show: Boolean
    ) {

        progress.visibility =
            if (show)
                View.VISIBLE
            else
                View.GONE
    }

    private fun toast(
        message: String
    ) {

        Toast.makeText(
            this,
            message,
            Toast.LENGTH_SHORT
        ).show()
    }

    private fun formatBytes(
        bytes: Long
    ): String {

        if (bytes <= 0)
            return "0 B"

        val units =
            arrayOf(
                "B",
                "KB",
                "MB",
                "GB",
                "TB"
            )

        var value =
            bytes.toDouble()

        var index = 0

        while (
            value >= 1024 &&
            index < units.lastIndex
        ) {

            value /= 1024
            index++
        }

        return if (index == 0) {

            "${value.toLong()} ${units[index]}"

        } else {

            "%.2f %s".format(
                value,
                units[index]
            )
        }
    }

    // =========================================================
    // START BACKGROUND LOOP
    // =========================================================

    private fun startBackgroundLoop() {

        mainHandler.postDelayed(
            pollRunnable,
            5_000
        )
    }

    // =========================================================
    // CLEANUP
    // =========================================================

    override fun onDestroy() {

        mainHandler.removeCallbacks(
            pollRunnable
        )

        executor.shutdownNow()

        super.onDestroy()
    }
}
