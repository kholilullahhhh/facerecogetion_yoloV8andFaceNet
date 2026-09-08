"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { ArrowLeft, Camera, Upload, Check } from "lucide-react";
import Link from "next/link";

export default function FaceRegistrationPage() {
  const params = useParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [capturedImages, setCapturedImages] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [studentName, setStudentName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get(`/admin/students/${params.id}`).then((res) => {
      setStudentName(res.data.data.name);
    });
  }, [params.id]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
    } catch {
      alert("Kamera tidak dapat diakses.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
        setCapturedImages((prev) => [...prev, file]);
      }
    }, "image/jpeg", 0.9);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages: File[] = [];
    for (let i = 0; i < files.length; i++) {
      newImages.push(files[i]);
    }
    setCapturedImages((prev) => [...prev, ...newImages]);
  };

  const handleRegister = async () => {
    if (capturedImages.length === 0) {
      alert("Minimal satu gambar harus diambil/diupload.");
      return;
    }
    setLoading(true);
    setResult("");
    try {
      const formData = new FormData();
      capturedImages.forEach((img) => {
        formData.append("images[]", img);
      });
      const res = await api.post(`/admin/students/${params.id}/embeddings`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(`Berhasil: ${res.data.data.embeddings_saved} embedding disimpan.`);
      setCapturedImages([]);
      stopCamera();
    } catch {
      setResult("Gagal mendaftarkan wajah.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/admin/students/${params.id}`}>
            <Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" />Kembali</Button>
          </Link>
          <h1 className="text-2xl font-bold">Daftarkan Wajah - {studentName}</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Kamera</span>
                <div className="flex gap-2">
                  {!isCameraActive ? (
                    <Button onClick={startCamera}><Camera className="mr-2 h-4 w-4" />Mulai</Button>
                  ) : (
                    <>
                      <Button onClick={capturePhoto}><Camera className="mr-2 h-4 w-4" />Ambil Foto</Button>
                      <Button variant="destructive" onClick={stopCamera}>Hentikan</Button>
                    </>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
                <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                {!isCameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Camera className="h-12 w-12 text-white opacity-50" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Upload Gambar</span>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />Upload
                  </Button>
                </CardTitle>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={handleFileUpload} />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Upload foto wajah (format: JPG, PNG). Minimal 3 foto untuk akurasi terbaik.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Foto Tertangkap ({capturedImages.length})</CardTitle></CardHeader>
              <CardContent>
                {capturedImages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada foto. Ambil melalui kamera atau upload.</p>
                ) : (
                  <div className="space-y-2">
                    {capturedImages.map((img, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg border p-2">
                        <Check className="h-4 w-4 text-green-600" />
                        <span className="text-sm">{img.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {result && (
              <div className={`rounded-lg p-3 text-sm ${result.includes("Berhasil") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                {result}
              </div>
            )}

            <Button onClick={handleRegister} disabled={loading || capturedImages.length === 0} className="w-full">
              {loading ? "Memproses..." : `Daftarkan ${capturedImages.length} Foto`}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
