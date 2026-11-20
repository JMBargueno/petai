import org.jetbrains.kotlin.gradle.dsl.JvmTarget

// Lo nativo de Android de tauri-plugin-pockai: el Keystore para la sesión y WorkManager para los
// avisos de cuidado. Rust lo llama por JNI (ver `src/android.rs`); no es un plugin de comandos.
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.pockai.core"
    compileSdk = 36

    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.9.0")
    implementation("androidx.work:work-runtime-ktx:2.10.1")
}
