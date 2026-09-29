// SecondMind zaman makinesi: Play moduna her gün ilk girişte Game görünümünden bir kare kaydeder.
// Sadece Editor'de çalışır (Assets/Editor altında, yapıya girmez); oyunun kendisine hiçbir şey eklemez.
// Kareler: <proje>/.secondmind/goruntuler/YYYY-MM-DD_HHmm.png (en fazla 1280 px genişlik).
// SecondMind "Köprüyü kaldır" ile bu dosyayı siler. Hata olursa sessizce geçer.
#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

[InitializeOnLoad]
public static class SecondMindSnapshot
{
    const int MaxWidth = 1280;
    const double DelaySeconds = 2.0;
    const double TimeoutSeconds = 6.0;

    // 0: bekleme yok, 1: çekim zamanını bekliyor, 2: geçici dosyayı bekliyor.
    static int phase;
    static double until;
    static string tempPath;

    static SecondMindSnapshot()
    {
        EditorApplication.playModeStateChanged += OnPlayModeChanged;
    }

    static string Folder
    {
        get
        {
            var root = Directory.GetParent(Application.dataPath).FullName;
            return Path.Combine(root, ".secondmind", "goruntuler");
        }
    }

    static void OnPlayModeChanged(PlayModeStateChange state)
    {
        try
        {
            if (state != PlayModeStateChange.EnteredPlayMode) return;
            var today = DateTime.Now.ToString("yyyy-MM-dd");
            if (Directory.Exists(Folder) && Directory.GetFiles(Folder, today + "_*.png").Any()) return;
            phase = 1;
            until = EditorApplication.timeSinceStartup + DelaySeconds;
            EditorApplication.update -= Tick;
            EditorApplication.update += Tick;
        }
        catch (Exception)
        {
            // Zaman makinesi oyunu asla durdurmaz.
        }
    }

    static void Stop()
    {
        phase = 0;
        EditorApplication.update -= Tick;
    }

    static void Tick()
    {
        try
        {
            if (phase == 1)
            {
                if (!EditorApplication.isPlaying) { Stop(); return; }
                if (EditorApplication.timeSinceStartup < until) return;
                Directory.CreateDirectory(Folder);
                tempPath = Path.Combine(Folder, "_cekiliyor.png");
                if (File.Exists(tempPath)) File.Delete(tempPath);
                // Kare, karenin sonunda Game görünümünden yazılır (güvenilir yol).
                ScreenCapture.CaptureScreenshot(tempPath);
                phase = 2;
                until = EditorApplication.timeSinceStartup + TimeoutSeconds;
                return;
            }
            if (phase == 2)
            {
                if (!File.Exists(tempPath))
                {
                    if (EditorApplication.timeSinceStartup > until) Stop();
                    return;
                }
                var bytes = File.ReadAllBytes(tempPath);
                if (bytes.Length == 0) return; // yazım sürüyor
                Stop();
                File.Delete(tempPath);
                var name = DateTime.Now.ToString("yyyy-MM-dd_HHmm") + ".png";
                File.WriteAllBytes(Path.Combine(Folder, name), Shrink(bytes));
            }
        }
        catch (Exception)
        {
            Stop();
        }
    }

    /** Genişlik 1280'i aşıyorsa oranı koruyarak küçültür. */
    static byte[] Shrink(byte[] png)
    {
        var src = new Texture2D(2, 2);
        if (!src.LoadImage(png) || src.width <= MaxWidth)
        {
            UnityEngine.Object.DestroyImmediate(src);
            return png;
        }
        var height = Mathf.RoundToInt(src.height * (MaxWidth / (float)src.width));
        var rt = RenderTexture.GetTemporary(MaxWidth, height);
        Graphics.Blit(src, rt);
        var prev = RenderTexture.active;
        RenderTexture.active = rt;
        var dst = new Texture2D(MaxWidth, height, TextureFormat.RGB24, false);
        dst.ReadPixels(new Rect(0, 0, MaxWidth, height), 0, 0);
        dst.Apply();
        RenderTexture.active = prev;
        RenderTexture.ReleaseTemporary(rt);
        var result = dst.EncodeToPNG();
        UnityEngine.Object.DestroyImmediate(src);
        UnityEngine.Object.DestroyImmediate(dst);
        return result;
    }
}
#endif
