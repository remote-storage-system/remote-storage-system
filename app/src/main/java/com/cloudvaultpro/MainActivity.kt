package com.example.cloudvaultpro

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

class MainActivity : AppCompatActivity() {

    private val serverUrl =
        "https://cloud-vault-server.onrender.com"

    private lateinit var apiKeyInput: EditText
    private lateinit var statusText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContentView(R.layout.activity_main)

        apiKeyInput = findViewById(R.id.apiKeyInput)
        statusText = findViewById(R.id.statusText)

        val connectButton =
            findViewById<Button>(R.id.connectButton)

        val healthButton =
            findViewById<Button>(R.id.healthButton)

        connectButton.setOnClickListener {
            testServer()
        }

        healthButton.setOnClickListener {
            testHealth()
        }
    }

    private fun testServer() {

        val apiKey =
            apiKeyInput.text.toString().trim()

        if (apiKey.isEmpty()) {

            Toast.makeText(
                this,
                "API Key डालिए",
                Toast.LENGTH_SHORT
            ).show()

            return
        }

        statusText.text =
            "⏳ Connecting..."

        thread {

            try {

                val url =
                    URL("$serverUrl/api/status")

                val connection =
                    url.openConnection()
                            as HttpURLConnection

                connection.requestMethod =
                    "GET"

                connection.setRequestProperty(
                    "X-API-Key",
                    apiKey
                )

                connection.connectTimeout =
                    15000

                connection.readTimeout =
                    15000

                val code =
                    connection.responseCode

                runOnUiThread {

                    if (code == 200) {

                        statusText.text =
                            "🟢 SERVER CONNECTED"

                        Toast.makeText(
                            this,
                            "Cloud Vault connected!",
                            Toast.LENGTH_SHORT
                        ).show()

                    } else {

                        statusText.text =
                            "🔴 Server response: $code"

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

                val url =
                    URL("$serverUrl/api/health")

                val connection =
                    url.openConnection()
                            as HttpURLConnection

                connection.requestMethod =
                    "GET"

                connection.connectTimeout =
                    15000

                connection.readTimeout =
                    15000

                val code =
                    connection.responseCode

                runOnUiThread {

                    if (code == 200) {

                        statusText.text =
                            "🟢 Cloud Vault Server ONLINE"

                    } else {

                        statusText.text =
                            "🔴 Server returned $code"

                    }
                }

                connection.disconnect()

            } catch (e: Exception) {

                runOnUiThread {

                    statusText.text =
                        "🔴 Server unreachable\n${e.message}"

                }

            }
        }
    }
}
