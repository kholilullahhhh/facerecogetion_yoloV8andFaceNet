"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Camera, 
  Users, 
  BarChart3, 
  ShieldCheck, 
  ScanFace, 
  CheckCircle2, 
  ArrowRight,
  Sparkles,
  Lock,
  FileSpreadsheet
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50/50 text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 font-semibold text-white shadow-sm shadow-blue-500/30">
              <ScanFace className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold leading-none tracking-tight">PresensiWajah</span>
              <span className="text-[10px] font-medium text-slate-500">SMP Aisyiyah Paccinongang</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white font-medium">
                Masuk Sistem
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-slate-200 bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
              
              {/* Sisi Kiri: Teks Hero */}
              <div className="space-y-6 lg:col-span-7">
                <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/60 px-3 py-1 text-xs font-semibold text-blue-700">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  <span>Sistem Presensi Generasi Baru</span>
                </div>
                
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-slate-900">
                  Otomatisasi Absensi Siswa dengan <span className="text-blue-600">Pencocokan Wajah</span>
                </h1>
                
                <p className="max-w-2xl text-base text-slate-600 sm:text-lg leading-relaxed">
                  Solusi presensi pintar untuk SMP Aisyiyah Paccinongang. Memangkas waktu pencatatan manual, meningkatkan akurasi kehadiran, dan terintegrasi secara real-time.
                </p>
                
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center pt-2">
                  <Link href="/login">
                    <Button size="lg" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 px-7">
                      Mulai Sekarang
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                  <a href="#fitur">
                    <Button size="lg" variant="outline" className="w-full sm:w-auto border-slate-300 text-slate-700 hover:bg-slate-100">
                      Lihat Fitur & Teknologi
                    </Button>
                  </a>
                </div>

                <div className="pt-4 flex items-center gap-6 text-xs text-slate-500 font-medium">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> YOLOv8 Architecture
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" /> FaceNet Embeddings
                  </span>
                </div>
              </div>

              {/* Sisi Kanan: Live Camera / Scanner Mockup */}
              <div className="lg:col-span-5">
                <div className="relative mx-auto max-w-sm rounded-2xl border border-slate-200 bg-slate-900 p-3 shadow-2xl shadow-slate-900/10">
                  {/* Top Bar Mockup */}
                  <div className="mb-3 flex items-center justify-between px-2 text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>Kamera Aktif</span>
                    </div>
                    <span>FPS: 30</span>
                  </div>

                  {/* Viewport Camera Mockup */}
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-800 flex flex-col items-center justify-center border border-slate-700">
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent z-10" />
                    
                    {/* Bounding Box Visualizer */}
                    <div className="relative z-0 flex flex-col items-center">
                      <div className="relative h-28 w-28 rounded-lg border-2 border-dashed border-blue-400/80 p-1 flex items-center justify-center">
                        <ScanFace className="h-16 w-16 text-slate-400" />
                        {/* Corner markers */}
                        <div className="absolute -top-1 -left-1 h-3 w-3 border-t-2 border-l-2 border-blue-500"></div>
                        <div className="absolute -top-1 -right-1 h-3 w-3 border-t-2 border-r-2 border-blue-500"></div>
                        <div className="absolute -bottom-1 -left-1 h-3 w-3 border-b-2 border-l-2 border-blue-500"></div>
                        <div className="absolute -bottom-1 -right-1 h-3 w-3 border-b-2 border-r-2 border-blue-500"></div>
                      </div>
                    </div>

                    {/* Overlay Status */}
                    <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between rounded-lg bg-slate-900/90 backdrop-blur border border-slate-700/80 px-3 py-2 text-xs text-white">
                      <div>
                        <p className="font-semibold text-emerald-400">Terverifikasi</p>
                        <p className="text-[10px] text-slate-300">Ahmad Fauzi (8B)</p>
                      </div>
                      <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300 font-mono">0.18s</span>
                    </div>
                  </div>

                  {/* Bottom Stats */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-slate-800/60 p-2 text-slate-300">
                      <span className="block text-[10px] text-slate-400">Akurasi Jarak</span>
                      <span className="font-mono font-semibold text-blue-400">Euclidean &lt; 0.6</span>
                    </div>
                    <div className="rounded-lg bg-slate-800/60 p-2 text-slate-300">
                      <span className="block text-[10px] text-slate-400">Status Database</span>
                      <span className="font-mono font-semibold text-emerald-400">Terhubung</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Fitur Utama - Bento Grid Style */}
        <section id="fitur" className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-12 text-center">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Fitur Dirancang Khusus untuk Sekolah
              </h2>
              <p className="mt-2 text-slate-600 text-sm sm:text-base max-w-xl mx-auto">
                Efisiensi pengelolaan data siswa dan kehadiran dalam satu dashboard terintegrasi.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {/* Feature 1 - Highlight */}
              <Card className="md:col-span-2 border-slate-200/80 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-white to-slate-50">
                <CardContent className="p-6 sm:p-8">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600 mb-4">
                    <Camera className="h-5 w-5" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Deteksi & Pencocokan Wajah Real-Time</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-lg">
                    Menggabungkan keandalan <strong>YOLOv8</strong> untuk mendeteksi posisi wajah secara presisi dan <strong>FaceNet</strong> untuk mengekstraksi vektor embedding wajah secara cepat.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">YOLOv8s</span>
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">FaceNet 512-d</span>
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">Sub-second Processing</span>
                  </div>
                </CardContent>
              </Card>

              {/* Feature 2 */}
              <Card className="border-slate-200/80 shadow-sm hover:shadow-md transition-shadow bg-white">
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 mb-4">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Absensi Otomatis</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    Siswa cukup berdiri di depan kamera. Kehadiran tercatat otomatis tanpa antrean dan tanpa sentuhan fisik.
                  </p>
                </CardContent>
              </Card>

              {/* Feature 3 */}
              <Card className="border-slate-200/80 shadow-sm hover:shadow-md transition-shadow bg-white">
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600 mb-4">
                    <Users className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Manajemen Siswa & Kelas</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    Kemudahan pendaftaran dataset wajah baru, manajemen rombel, dan pembaruan data dalam satu portal.
                  </p>
                </CardContent>
              </Card>

              {/* Feature 4 */}
              <Card className="border-slate-200/80 shadow-sm hover:shadow-md transition-shadow bg-white">
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600 mb-4">
                    <FileSpreadsheet className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Rekap & Ekspor CSV</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    Laporan kehadiran harian maupun bulanan siap diekspor ke format CSV/Excel untuk kebutuhan administrasi.
                  </p>
                </CardContent>
              </Card>

              {/* Feature 5 */}
              <Card className="border-slate-200/80 shadow-sm hover:shadow-md transition-shadow bg-white">
                <CardContent className="p-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100 text-rose-600 mb-4">
                    <Lock className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Keamanan Data Terjamin</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    Sistem menyimpan vektor matematika (embedding), bukan foto mentah berukuran besar, menjaga privasi data siswa.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Workflow Section */}
        <section className="border-t border-slate-200 bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-14 text-center">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Tiga Langkah Praktis Presensi
              </h2>
              <p className="mt-2 text-slate-600 text-sm sm:text-base">
                Proses cepat yang memudahkan guru dan siswa setiap harinya.
              </p>
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <div className="relative rounded-xl border border-slate-100 bg-slate-50/50 p-6">
                <div className="mb-4 text-xs font-bold text-blue-600 font-mono tracking-wider">LANGKAH 01</div>
                <h3 className="text-base font-bold text-slate-900">Registrasi Wajah Siswa</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Unggah foto siswa saat pendaftaran awal. Sistem akan membuat enkoding numerik khusus.
                </p>
              </div>

              <div className="relative rounded-xl border border-slate-100 bg-slate-50/50 p-6">
                <div className="mb-4 text-xs font-bold text-blue-600 font-mono tracking-wider">LANGKAH 02</div>
                <h3 className="text-base font-bold text-slate-900">Buka Sesi Presensi</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Guru/Administrator mengaktifkan sesi presensi pada kelas dan mata pelajaran yang berlangsung.
                </p>
              </div>

              <div className="relative rounded-xl border border-slate-100 bg-slate-50/50 p-6">
                <div className="mb-4 text-xs font-bold text-blue-600 font-mono tracking-wider">LANGKAH 03</div>
                <h3 className="text-base font-bold text-slate-900">Scan & Terdeteksi</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Siswa cukup menghadap ke kamera. Kehadiran akan langsung tercatat di database harian.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-slate-900 py-16 text-white">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Siap Memulai Presensi Berbasis Digital?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-slate-400 text-sm sm:text-base">
              Akses panel admin dan guru untuk mulai mengelola kehadiran siswa SMP Aisyiyah Paccinongang.
            </p>
            <div className="mt-8">
              <Link href="/login">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-8 shadow-lg shadow-blue-600/30">
                  Masuk ke Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-slate-500 sm:px-6">
          <p>© {new Date().getFullYear()} SMP Aisyiyah Paccinongang. All rights reserved.</p>
          <p className="mt-1 text-[11px] text-slate-400">
            Powered by Computer Vision Technology (YOLOv8 & FaceNet)
          </p>
        </div>
      </footer>
    </div>
  );
}