# kotlinx.serialization: conserva los serializadores generados de los modelos de red
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class com.petai.app.data.** { *** Companion; }
-keepclasseswithmembers class com.petai.app.data.** { kotlinx.serialization.KSerializer serializer(...); }
