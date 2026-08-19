package com.example.cloudvaultpro

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {

    private val serverUrl =
        "https://cloud-vault-server.onrender.com"

    private lateinit var statusText: TextView
    private lateinit var apiKeyInput: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContentView(R.layout.activity_main)

        apiKeyInput = findViewById(R.id.apiKeyInput)
        statusText = findViewById(R.id.statusText)

        findViewById<Button>(R.id.connectButton)
            .setOnClickListener {
                testServer()
            }

        findViewById<Button>(R.id.healthButton)
            .setOnClickListener {
                testHealth()
            }

        findViewById<Button>(R.id.storageButton)
            .setOnClickListener {
                showStorageInfo()
            }

        findViewById<Button>(R.id.remoteButton)
            .setOnClickListener {
                openRemotePanel()
            }

        findViewById<Button>(R.id.filesButton)
            .setOnClickListener {
                chooseFile()
            }

        findViewById<Button>(R.id.settingsButton)
            .setOnClickListener {
                openAppSettings()
            }

        statusText.text =
            "● Cloud Vault ready"
    }

    private fun testServer() {

        val apiKey =
            apiKeyInput.text.toString().trim()

        if (apiKey.isEmpty()) {
            statusText.text =
                "⚠️ Please enter your API key"
            return
        }

        statusText.text =
            "⏳ Connecting to Cloud Vault..."

        thread {

            try {

                val connection =
                    URL("$serverUrl/api/status")
                        .openConnection()
                            as HttpURLConnection

                connection.requestMethod = "GET"

                connection.setRequestProperty(
                    "X-API-Key",
                    apiKey
                )

                connection.connectTimeout = 20000
                connection.readTimeout = 20000

                val response =
                    connection.responseCode

                runOnUiThread {

                    if (response == 200) {

                        statusText.text =
                            "🟢 CLOUD VAULT CONNECTED"

                        Toast.makeText(
                            this,
                            "Server connected successfully",
                            Toast.LENGTH_SHORT
                        ).show()

                    } else if (response == 401) {

                        statusText.text =
                            "🔴 Invalid API key"

                    } else {

                        statusText.text =
                            "🔴 Server response: $response"
                    }
                }

                connection.disconnect()

            } catch (e: Exception) {

                runOnUiThread {

                    statusText.text =
                        "🔴 Connection failed\n${e.message}"
                }
            }
        }
    }

    private fun testHealth() {

        statusText.text =
            "⏳ Checking server..."

        thread {

            try {

                val connection =
                    URL("$serverUrl/api/health")
                        .openConnection()
                            as HttpURLConnection

                connection.requestMethod = "GET"

                connection.connectTimeout = 20000
                connection.readTimeout = 20000

                val response =
                    connection.responseCode

                runOnUiThread {

                    if (response == 200) {

                        statusText.text =
                            "🟢 SERVER ONLINE"

                    } else {

                        statusText.text =
                            "🔴 Server response: $response"
                    }
                }

                connection.disconnect()

            } catch (e: Exception) {

                runOnUiThread {

                    statusText.text =
                        "🔴 Server unavailable"
                }
            }
        }
    }

    private fun showStorageInfo() {

        statusText.text =
            "📦 Cloud Storage\n\n" +
            "Your Cloud Vault storage panel is ready.\n\n" +
            "Upload • Download • Delete"
    }

    private fun openRemotePanel() {

        statusText.text =
            "📱 Remote Devices\n\n" +
            "Remote phone control panel is ready.\n\n" +
            "Pair • Download • Delete"
    }

    private fun chooseFile() {

        val intent =
            Intent(Intent.ACTION_OPEN_DOCUMENT)

        intent.type = "*/*"

        intent.addCategory(
            Intent.CATEGORY_OPENABLE
        )

        startActivityForResult(
            intent,
            1001
        )
    }

    override fun onActivityResult(
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {

        super.onActivityResult(
            requestCode,
            resultCode,
            data
        )

        if (
            requestCode == 1001 &&
            resultCode == RESULT_OK
        ) {

            val uri: Uri? =
                data?.data

            if (uri != null) {

                statusText.text =
                    "📄 File selected\n\n$uri"
            }
        }
    }

    private fun openAppSettings() {

        val intent =
            Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS
            )

        intent.data =
            Uri.parse(
                "package:$packageName"
            )

        startActivity(intent)
    }
}
