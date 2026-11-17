plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.petai.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.petai.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        debug {
            // 10.0.2.2 es el PC anfitrión visto desde el emulador de Android
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:3000/v1\"")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Dirección del backend en producción (obligatoriamente HTTPS)
            buildConfigField("String", "API_BASE_URL", "\"https://api.petai.example/v1\"")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    sourceSets {
        // Los sprites SVG son la fuente única compartida con escritorio (shared/assets/sprites)
        getByName("main").assets.directories.add("../../../shared/assets")
        // Núcleo de escena compartido (@pockai/scene) en assets/scene/ (ver tarea syncPockaiScene)
        getByName("main").assets.directories.add("build/generated/pockaiScene")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        optIn.add("androidx.compose.material3.ExperimentalMaterial3ExpressiveApi")
        optIn.add("androidx.compose.material3.ExperimentalMaterial3Api")
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.glance.material3)
    implementation(libs.androidx.work.runtime)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.socket.io.client)
    implementation(libs.coil.compose)
    implementation(libs.coil.svg)
    implementation(libs.androidx.webkit)
}

/**
 * Copia el bundle web de la escena (sala isométrica + Pockai, PixiJS) a los assets de la app. Se
 * genera desde la raíz del monorepo con `pnpm --filter @pockai/scene build:embed`
 * (docs/ART_PIPELINE.md §9); la app lo carga sin red con WebViewAssetLoader.
 */
val syncPockaiScene by tasks.registering(Sync::class) {
    // Solo valores simples dentro de doFirst: el configuration cache no admite referencias al script.
    val distPath = rootProject.file("../../shared/scene/dist/embed").absolutePath
    from(distPath)
    into(layout.buildDirectory.dir("generated/pockaiScene/scene"))
    doFirst {
        if (!File(distPath, "index.html").exists()) {
            throw GradleException(
                "Falta el bundle de la escena en $distPath. Ejecuta desde la raíz del repo: " +
                    "pnpm --filter @pockai/scene build:embed",
            )
        }
    }
}
tasks.named("preBuild") { dependsOn(syncPockaiScene) }
