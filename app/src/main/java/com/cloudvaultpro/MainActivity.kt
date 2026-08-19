package com.cloudvaultpro

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {

    /*
     * IMPORTANT:
     * यहाँ अपने CloudVault server का HTTPS address डालें।
     *
     * Example:
     * private val SERVER_URL = "https://your-server.onrender.com"
     */
    private val SERVER_URL = "https://YOUR-SERVER-URL"

    private lateinit var serverText: TextView
    private lateinit var statusText: TextView
    private lateinit var filesContainer: LinearLayout
    private lateinit var refreshButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        serverText = findViewById(R.id.serverText)
        statusText = findViewById(R.id.statusText)
        filesContainer = findViewById(R.id.filesContainer)
        refreshButton = findViewById(R.id.refreshButton)

        serverText.text = "Server: $SERVER_URL"

        refreshButton.setOnClickListener {
            loadFiles()
        }

        loadFiles()
    }

    private fun loadFiles() {

        statusText.text = "Connecting to server..."
        refreshButton.isEnabled = false

        thread {

            try {

                val connection =
                    URL("$SERVER_URL/api/files").openConnection() as HttpURLConnection

                connection.requestMethod = "GET"
                connection.connectTimeout = 15000
                connection.readTimeout = 15000

                val responseCode = connection.responseCode

                val response =
                    connection.inputStream.bufferedReader().use { it.readText() }

                connection.disconnect()

                runOnUiThread {

                    refreshButton.isEnabled = true

                    if (responseCode in 200..299) {
                        showFiles(response)
                        statusText.text = "Server connected"
                    } else {
                        statusText.text =
                            "Server error: HTTP $responseCode"
                    }
                }

            } catch (e: Exception) {

                runOnUiThread {

                    refreshButton.isEnabled = true

                    statusText.text =
                        "Connection failed: ${e.message}"
                }
            }
        }
    }

    private fun showFiles(json: String) {

        filesContainer.removeAllViews()

        try {

            val array = JSONArray(json)

            if (array.length() == 0) {

                val empty = TextView(this)
                empty.text = "No files on server"
                empty.textSize = 17f

                filesContainer.addView(empty)

                return
            }

            for (i in 0 until array.length()) {

                val item = array.getJSONObject(i)

                val name = item.optString("name")
                val size = item.optLong("size", 0)

                addFileRow(name, size)
            }

        } catch (e: Exception) {

            /*
             * Some APIs return:
             * { "files": [...] }
             */

            try {

                val root = org.json.JSONObject(json)
                val array = root.optJSONArray("files")

                if (array != null) {

                    for (i in 0 until array.length()) {

                        val item = array.getJSONObject(i)

                        val name = item.optString("name")
                        val size = item.optLong("size", 0)

                        addFileRow(name, size)
                    }

                    return
                }

            } catch (_: Exception) {
            }

            statusText.text = "Invalid server response"
        }
    }

    private fun addFileRow(name: String, size: Long) {

        val row = LinearLayout(this)

        row.orientation = LinearLayout.VERTICAL
        row.setPadding(0, 20, 0, 20)

        val title = TextView(this)

        title.text =
            "$name\n${formatSize(size)}"

        title.textSize = 17f

        val buttons = LinearLayout(this)

        buttons.orientation = LinearLayout.HORIZONTAL

        val downloadButton = Button(this)
        downloadButton.text = "Download"

        val deleteButton = Button(this)
        deleteButton.text = "Delete"

        downloadButton.setOnClickListener {
            downloadFile(name)
        }

        deleteButton.setOnClickListener {

            val confirm = AlertDialog.Builder(this)
                .setTitle("Delete remote file?")
                .setMessage(
                    "This will delete '$name' from CloudVaultPro server."
                )
                .setPositiveButton("Delete") { _, _ ->
                    deleteFile(name)
                }
                .setNegativeButton("Cancel", null)
                .create()

            confirm.show()
        }

        buttons.addView(downloadButton)
        buttons.addView(deleteButton)

        row.addView(title)
        row.addView(buttons)

        filesContainer.addView(row)
    }

    private fun downloadFile(name: String) {

        try {

            val encodedName =
                URLEncoder.encode(name, "UTF-8")

            val url =
                "$SERVER_URL/api/files/download/$encodedName"

            val request =
                DownloadManager.Request(Uri.parse(url))

            request.setTitle(name)
            request.setDescription("Downloading from CloudVaultPro")

            request.setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            )

            request.setDestinationInExternalPublicDir(
                Environment.DIRECTORY_DOWNLOADS,
                name
            )

            val manager =
                getSystemService(Context.DOWNLOAD_SERVICE)
                        as DownloadManager

            manager.enqueue(request)

            statusText.text =
                "Download started: $name"

        } catch (e: Exception) {

            statusText.text =
                "Download failed: ${e.message}"
        }
    }

    private fun deleteFile(name: String) {

        statusText.text = "Deleting $name..."

        thread {

            try {

                val encodedName =
                    URLEncoder.encode(name, "UTF-8")

                val connection =
                    URL("$SERVER_URL/api/files/$encodedName")
                        .openConnection() as HttpURLConnection

                connection.requestMethod = "DELETE"
                connection.connectTimeout = 15000
                connection.readTimeout = 15000

                val code = connection.responseCode

                connection.disconnect()

                runOnUiThread {

                    if (code in 200..299) {

                        statusText.text =
                            "Deleted: $name"

                        loadFiles()

                    } else {

                        statusText.text =
                            "Delete failed: HTTP $code"
                    }
                }

            } catch (e: Exception) {

                runOnUiThread {

                    statusText.text =
                        "Delete failed: ${e.message}"
                }
            }
        }
    }

    private fun formatSize(bytes: Long): String {

        if (bytes <= 0) return "0 B"

        val kb = bytes / 1024.0

        if (kb < 1024)
            return String.format("%.1f KB", kb)

        val mb = kb / 1024.0

        if (mb < 1024)
            return String.format("%.1f MB", mb)

        val gb = mb / 1024.0

        return String.format("%.2f GB", gb)
    }
}
