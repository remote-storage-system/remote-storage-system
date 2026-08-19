package com.cloudvaultpro

import android.app.AlertDialog
import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {

    private val SERVER_URL =
        "https://cloud-vault-server.onrender.com"

    /*
     * IMPORTANT:
     * यहाँ अपने Render Environment Variables वाला
     * वही API_KEY डालना होगा।
     *
     * Example:
     * private val API_KEY = "YOUR_REAL_API_KEY"
     */
    private val API_KEY =
        "YOUR_REAL_API_KEY"

    private lateinit var statusText: TextView
    private lateinit var storageText: TextView
    private lateinit var filesContainer: LinearLayout
    private lateinit var refreshButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContentView(R.layout.activity_main)

        statusText = findViewById(R.id.statusText)
        storageText = findViewById(R.id.storageText)
        filesContainer = findViewById(R.id.filesContainer)
        refreshButton = findViewById(R.id.refreshButton)

        refreshButton.setOnClickListener {
            loadStorage()
            loadFiles("")
        }

        loadStorage()
        loadFiles("")
    }

    // ============================================================
    // COMMON AUTH
    // ============================================================

    private fun addAuth(connection: HttpURLConnection) {

        connection.setRequestProperty(
            "X-API-Key",
            API_KEY
        )

        connection.setRequestProperty(
            "Accept",
            "application/json"
        )
    }

    // ============================================================
    // STORAGE
    // ============================================================

    private fun loadStorage() {

        thread {

            try {

                val connection =
                    URL(
                        "$SERVER_URL/api/storage"
                    ).openConnection()
                            as HttpURLConnection

                connection.requestMethod = "GET"

                connection.connectTimeout = 15000
                connection.readTimeout = 15000

                addAuth(connection)

                val code =
                    connection.responseCode

                val response =
                    readResponse(
                        connection,
                        code
                    )

                connection.disconnect()

                runOnUiThread {

                    if (code in 200..299) {

                        try {

                            val json =
                                JSONObject(response)

                            val usedMB =
                                json.optString(
                                    "usedMB",
                                    "0"
                                )

                            val usedGB =
                                json.optString(
                                    "usedGB",
                                    "0"
                                )

                            storageText.text =
                                "Used Storage: $usedMB MB  •  $usedGB GB"

                        } catch {

                            storageText.text =
                                "Storage information unavailable"
                        }

                    } else {

                        storageText.text =
                            "Storage error: HTTP $code"
                    }
                }

            } catch (e: Exception) {

                runOnUiThread {

                    storageText.text =
                        "Storage connection failed"
                }
            }
        }
    }

    // ============================================================
    // LIST FILES
    // ============================================================

    private fun loadFiles(currentPath: String) {

        runOnUiThread {

            statusText.text =
                "☁ Connecting to CloudVault..."

            refreshButton.isEnabled = false
        }

        thread {

            try {

                val encodedPath =
                    URLEncoder.encode(
                        currentPath,
                        "UTF-8"
                    )

                val url =
                    "$SERVER_URL/api/files?path=$encodedPath"

                val connection =
                    URL(url).openConnection()
                            as HttpURLConnection

                connection.requestMethod = "GET"

                connection.connectTimeout = 15000
                connection.readTimeout = 15000

                addAuth(connection)

                val code =
                    connection.responseCode

                val response =
                    readResponse(
                        connection,
                        code
                    )

                connection.disconnect()

                runOnUiThread {

                    refreshButton.isEnabled = true

                    if (code in 200..299) {

                        showFiles(
                            response,
                            currentPath
                        )

                        statusText.text =
                            "✓ CloudVault connected"

                    } else {

                        statusText.text =
                            "Server error: HTTP $code\n$response"
                    }
                }

            } catch (e: Exception) {

                runOnUiThread {

                    refreshButton.isEnabled = true

                    statusText.text =
                        "Connection failed:\n${e.message}"
                }
            }
        }
    }

    // ============================================================
    // SHOW FILES
    // ============================================================

    private fun showFiles(
        response: String,
        currentPath: String
    ) {

        filesContainer.removeAllViews()

        try {

            val root =
                JSONObject(response)

            val items =
                root.optJSONArray("items")
                    ?: JSONArray()

            if (items.length() == 0) {

                val empty =
                    TextView(this)

                empty.text =
                    "☁ No files found"

                empty.textSize = 17f

                empty.setPadding(
                    10,
                    30,
                    10,
                    30
                )

                filesContainer.addView(empty)

                return
            }

            for (
                i in 0 until items.length()
            ) {

                val item =
                    items.getJSONObject(i)

                val name =
                    item.optString("name")

                val type =
                    item.optString("type")

                val size =
                    item.optLong("size", 0)

                val path =
                    item.optString("path")

                addFileItem(
                    name,
                    type,
                    size,
                    path
                )
            }

        } catch (e: Exception) {

            statusText.text =
                "Invalid server response:\n${e.message}"
        }
    }

    // ============================================================
    // FILE ITEM
    // ============================================================

    private fun addFileItem(
        name: String,
        type: String,
        size: Long,
        path: String
    ) {

        val box =
            LinearLayout(this)

        box.orientation =
            LinearLayout.VERTICAL

        box.setPadding(
            10,
            15,
            10,
            15
        )

        val title =
            TextView(this)

        if (type == "folder") {

            title.text =
                "📁 $name"

        } else {

            title.text =
                "📄 $name\n${formatSize(size)}"
        }

        title.textSize = 17f

        box.addView(title)

        if (type == "file") {

            val buttons =
                LinearLayout(this)

            buttons.orientation =
                LinearLayout.HORIZONTAL

            val download =
                Button(this)

            download.text =
                "⬇ Download"

            val delete =
                Button(this)

            delete.text =
                "🗑 Delete"

            buttons.addView(
                download
            )

            buttons.addView(
                delete
            )

            download.setOnClickListener {

                downloadFile(path)
            }

            delete.setOnClickListener {

                confirmDelete(path)
            }

            box.addView(buttons)

        } else {

            val open =
                Button(this)

            open.text =
                "Open Folder"

            open.setOnClickListener {

                loadFiles(path)
            }

            box.addView(open)
        }

        filesContainer.addView(box)
    }

    // ============================================================
    // DOWNLOAD
    // ============================================================

    private fun downloadFile(
        filePath: String
    ) {

        try {

            val encoded =
                URLEncoder.encode(
                    filePath,
                    "UTF-8"
                )

            val downloadUrl =
                "$SERVER_URL/api/download?path=$encoded"

            val request =
                DownloadManager.Request(
                    Uri.parse(downloadUrl)
                )

            request.addRequestHeader(
                "X-API-Key",
                API_KEY
            )

            request.setTitle(
                filePath.substringAfterLast("/")
            )

            request.setDescription(
                "Downloading from CloudVaultPro"
            )

            request.setNotificationVisibility(
                DownloadManager
                    .Request
                    .VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            )

            request.setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS,
                filePath.substringAfterLast("/")
            )

            val manager =
                getSystemService(
                    Context.DOWNLOAD_SERVICE
                ) as DownloadManager

            manager.enqueue(request)

            statusText.text =
                "⬇ Download started"

        } catch (e: Exception) {

            statusText.text =
                "Download failed: ${e.message}"
        }
    }

    // ============================================================
    // DELETE CONFIRMATION
    // ============================================================

    private fun confirmDelete(
        filePath: String
    ) {

        AlertDialog.Builder(this)
            .setTitle("Delete file?")
            .setMessage(
                "Delete this file from CloudVault?\n\n$filePath"
            )
            .setPositiveButton(
                "Delete"
            ) { _, _ ->

                deleteFile(filePath)
            }
            .setNegativeButton(
                "Cancel",
                null
            )
            .show()
    }

    // ============================================================
    // DELETE
    // ============================================================

    private fun deleteFile(
        filePath: String
    ) {

        statusText.text =
            "Deleting..."

        thread {

            try {

                val connection =
                    URL(
                        "$SERVER_URL/api/files"
                    ).openConnection()
                            as HttpURLConnection

                connection.requestMethod =
                    "DELETE"

                connection.connectTimeout =
                    15000

                connection.readTimeout =
                    15000

                connection.doOutput =
                    true

                connection.setRequestProperty(
                    "Content-Type",
                    "application/json"
                )

                addAuth(connection)

                val body =
                    JSONObject()
                        .put(
                            "path",
                            filePath
                        )
                        .toString()

                connection.outputStream.use {

                    it.write(
                        body.toByteArray(
                            Charsets.UTF_8
                        )
                    )
                }

                val code =
                    connection.responseCode

                val response =
                    readResponse(
                        connection,
                        code
                    )

                connection.disconnect()

                runOnUiThread {

                    if (code in 200..299) {

                        statusText.text =
                            "✓ Deleted successfully"

                        loadStorage()
                        loadFiles("")

                    } else {

                        statusText.text =
                            "Delete failed: HTTP $code\n$response"
                    }
                }

            } catch (e: Exception) {

                runOnUiThread {

                    statusText.text =
                        "Delete failed:\n${e.message}"
                }
            }
        }
    }

    // ============================================================
    // RESPONSE
    // ============================================================

    private fun readResponse(
        connection: HttpURLConnection,
        code: Int
    ): String {

        val stream =
            if (code in 200..299) {

                connection.inputStream

            } else {

                connection.errorStream
            }

        return stream
            ?.bufferedReader()
            ?.use {
                it.readText()
            }
            ?: ""
    }

    // ============================================================
    // FORMAT SIZE
    // ============================================================

    private fun formatSize(
        bytes: Long
    ): String {

        if (bytes <= 0)
            return "0 B"

        val kb =
            bytes / 1024.0

        if (kb < 1024)
            return "%.1f KB".format(kb)

        val mb =
            kb / 1024.0

        if (mb < 1024)
            return "%.1f MB".format(mb)

        val gb =
            mb / 1024.0

        return "%.2f GB".format(gb)
    }
}
