using System;
using System.Threading.Tasks;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage;
using Windows.Storage.Streams;

public static class Program
{
    public static int Main(string[] args)
    {
        try
        {
            if (args.Length == 0)
            {
                Console.Error.WriteLine("Image path is required.");
                return 1;
            }

            RunAsync(args[0]).GetAwaiter().GetResult();
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex);
            return 1;
        }
    }

    private static async Task RunAsync(string imagePath)
    {
        StorageFile file = await StorageFile.GetFileFromPathAsync(imagePath);
        using IRandomAccessStream stream = await file.OpenAsync(FileAccessMode.Read);
        BitmapDecoder decoder = await BitmapDecoder.CreateAsync(stream);
        SoftwareBitmap bitmap = await decoder.GetSoftwareBitmapAsync();
        OcrEngine engine = OcrEngine.TryCreateFromUserProfileLanguages();
        OcrResult result = await engine.RecognizeAsync(bitmap);
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.WriteLine(result.Text);
    }
}
