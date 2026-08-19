package com.cloudvaultpro;

import android.os.Bundle;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        TextView textView = new TextView(this);

        textView.setText(
                "☁️ Cloud Vault Pro\n\n" +
                "SERVER ONLINE\n\n" +
                "Cloud storage controller is ready."
        );

        textView.setTextSize(22);
        textView.setPadding(40, 80, 40, 40);

        setContentView(textView);
    }
          }
