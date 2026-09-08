"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Camera, 
  Users, 
  ScanFace, 
  CheckCircle2, 
  ArrowRight,
  Sparkles,
  Lock,
  FileSpreadsheet,
  ChevronRight,
  Play,
  Clock,
  ShieldCheck,
  Zap
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, useScroll, useTransform, AnimatePresence, useInView } from "framer-motion";

// Seeded PRNG (mulberry32) for deterministic random values during SSR
function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const particleData = Array.from({ length: 20 }, (_, i) => {
  const rand = mulberry32(i * 12345 + 67890);
  return {
    id: i,
    left: rand() * 100,
    top: rand() * 100,
    duration: 3 + rand() * 3,
    delay: rand() * 3,
  };
});

// ===== ANIMATION VARIANTS =====
const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const fadeInScale = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: "easeOut" } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2
    }
  }
};

const slideInLeft = {
  hidden: { opacity: 0, x: -40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const slideInRight = {
  hidden: { opacity: 0, x: 40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: "easeOut" } }
};

const floatAnimation = {
  y: [0, -8, 0],
  transition: { duration: 3, repeat: Infinity, ease: "easeInOut" }
};

const pulseGlow = {
  scale: [1, 1.02, 1],
  opacity: [0.6, 1, 0.6],
  transition: { duration: 2, repeat: Infinity, ease: "easeInOut" }
};

// ===== CUSTOM HOOKS =====
const useScrollProgress = () => {
  const [scrollProgress, setScrollProgress] = useState(0);
  
  useEffect(() => {
    const handleScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      const progress = total > 0 ? window.scrollY / total : 0;
      setScrollProgress(progress);
    };
    
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  
  return scrollProgress;
};

// ===== COMPONENTS =====
const AnimatedSection = ({ children, className = "", delay = 0, ...props }: any) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={fadeInUp}
      transition={{ delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
};

const AnimatedCard = ({ children, className = "", delay = 0, index = 0 }: any) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={fadeInScale}
      transition={{ delay: delay + index * 0.1 }}
      className={className}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      {children}
    </motion.div>
  );
};

// ===== MAIN COMPONENT =====
export default function LandingPage() {
  const scrollProgress = useScrollProgress();
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);
  
  // Mouse tracking untuk efek parallax
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);
  
  // Fitur data untuk kartu
  const features = [
    {
      icon: Camera,
      color: "blue",
      title: "Deteksi & Pencocokan Wajah Real-Time",
      description: "Menggabungkan keandalan YOLOv8 untuk mendeteksi posisi wajah secara presisi dan FaceNet untuk mengekstraksi vektor embedding wajah secara cepat.",
      tags: ["YOLOv8s", "FaceNet 512-d", "Sub-second Processing"],
      highlight: true
    },
    {
      icon: CheckCircle2,
      color: "emerald",
      title: "Absensi Otomatis",
      description: "Siswa cukup berdiri di depan kamera. Kehadiran tercatat otomatis tanpa antrean dan tanpa sentuhan fisik."
    },
    {
      icon: Users,
      color: "purple",
      title: "Manajemen Siswa & Kelas",
      description: "Kemudahan pendaftaran dataset wajah baru, manajemen rombel, dan pembaruan data dalam satu portal."
    },
    {
      icon: FileSpreadsheet,
      color: "amber",
      title: "Rekap & Ekspor CSV",
      description: "Laporan kehadiran harian maupun bulanan siap diekspor ke format CSV/Excel untuk kebutuhan administrasi."
    },
    {
      icon: Lock,
      color: "rose",
      title: "Keamanan Data Terjamin",
      description: "Sistem menyimpan vektor matematika (embedding), bukan foto mentah berukuran besar, menjaga privasi data siswa."
    }
  ];

  const colorMap = {
    blue: { bg: "bg-blue-100", text: "text-blue-600", border: "border-blue-200", glow: "shadow-blue-500/20" },
    emerald: { bg: "bg-emerald-100", text: "text-emerald-600", border: "border-emerald-200", glow: "shadow-emerald-500/20" },
    purple: { bg: "bg-purple-100", text: "text-purple-600", border: "border-purple-200", glow: "shadow-purple-500/20" },
    amber: { bg: "bg-amber-100", text: "text-amber-600", border: "border-amber-200", glow: "shadow-amber-500/20" },
    rose: { bg: "bg-rose-100", text: "text-rose-600", border: "border-rose-200", glow: "shadow-rose-500/20" }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/50 text-slate-900 selection:bg-blue-100 selection:text-blue-900 overflow-x-hidden">
      
      {/* ===== PROGRESS BAR ===== */}
      <motion.div 
        className="fixed top-0 left-0 right-0 h-1 bg-blue-600 z-[100] origin-left"
        style={{ scaleX: scrollProgress }}
      />
      
      {/* ===== HEADER ===== */}
      <motion.header 
        className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-md"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <motion.div 
            className="flex items-center gap-3 cursor-pointer"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <motion.div 
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 font-semibold text-white shadow-sm shadow-blue-500/30"
              animate={{ rotate: [0, -5, 5, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            >
              <ScanFace className="h-5 w-5" />
            </motion.div>
            <div className="flex flex-col">
              <span className="text-base font-bold leading-none tracking-tight">PresensiWajah</span>
              <span className="text-[10px] font-medium text-slate-500">SMP Aisyiyah Paccinongang</span>
            </div>
          </motion.div>
          
          <motion.div 
            className="flex items-center gap-3"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link href="/login">
              <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white font-medium group relative overflow-hidden">
                <span className="relative z-10">Masuk Sistem</span>
                <motion.span 
                  className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: 0 }}
                  transition={{ duration: 0.3 }}
                />
              </Button>
            </Link>
          </motion.div>
        </div>
      </motion.header>

      <main className="flex-1">
        
        {/* ===== HERO SECTION ===== */}
        <section className="relative overflow-hidden border-b border-slate-200 bg-white py-16 sm:py-24">
          {/* Background efek */}
          <motion.div 
            className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-blue-500/5 blur-3xl"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div 
            className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-purple-500/5 blur-3xl"
            animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          />
          
          <div className="mx-auto max-w-6xl px-4 sm:px-6 relative z-10">
            <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
              
              {/* Sisi Kiri: Teks Hero */}
              <motion.div 
                className="space-y-6 lg:col-span-7"
                initial="hidden"
                animate="visible"
                variants={staggerContainer}
              >
                <motion.div 
                  variants={fadeInUp}
                  className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/60 px-3 py-1 text-xs font-semibold text-blue-700"
                  whileHover={{ scale: 1.05, backgroundColor: "#dbeafe" }}
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  <span>Sistem Presensi Generasi Baru</span>
                </motion.div>
                
                <motion.h1 
                  variants={fadeInUp}
                  className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-slate-900 leading-tight"
                >
                  Otomatisasi Absensi Siswa dengan{" "}
                  <motion.span 
                    className="text-blue-600 inline-block relative"
                    animate={{ 
                      textShadow: ["0 0 0px rgba(37,99,235,0)", "0 0 20px rgba(37,99,235,0.2)", "0 0 0px rgba(37,99,235,0)"] 
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    Pencocokan Wajah
                    <motion.span 
                      className="absolute -bottom-1 left-0 right-0 h-1 bg-blue-600 rounded-full"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.8, delay: 0.5 }}
                    />
                  </motion.span>
                </motion.h1>
                
                <motion.p 
                  variants={fadeInUp}
                  className="max-w-2xl text-base text-slate-600 sm:text-lg leading-relaxed"
                >
                  Solusi presensi pintar untuk SMP Aisyiyah Paccinongang. Memangkas waktu pencatatan manual, meningkatkan akurasi kehadiran, dan terintegrasi secara real-time.
                </motion.p>
                
                <motion.div 
                  variants={fadeInUp}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center pt-2"
                >
                  <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                    <Link href="/login">
                      <Button size="lg" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20 px-7 group relative overflow-hidden">
                        <span className="relative z-10 flex items-center">
                          Mulai Sekarang
                          <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        </span>
                        <motion.span 
                          className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-800"
                          initial={{ x: "-100%" }}
                          whileHover={{ x: 0 }}
                          transition={{ duration: 0.4 }}
                        />
                      </Button>
                    </Link>
                  </motion.div>
                  <motion.a 
                    href="#fitur"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Button size="lg" variant="outline" className="w-full sm:w-auto border-slate-300 text-slate-700 hover:bg-slate-100">
                      Lihat Fitur & Teknologi
                    </Button>
                  </motion.a>
                </motion.div>

                <motion.div 
                  variants={fadeInUp}
                  className="pt-4 flex flex-wrap items-center gap-4 text-xs text-slate-500 font-medium"
                >
                  {["YOLOv8 Architecture", "FaceNet Embeddings", "Real-time Processing", "Secure Database"].map((text, i) => (
                    <motion.span 
                      key={i}
                      className="flex items-center gap-1.5"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.8 + i * 0.1 }}
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      {text}
                    </motion.span>
                  ))}
                </motion.div>
              </motion.div>

              {/* Sisi Kanan: Live Camera Mockup */}
              <motion.div 
                className="lg:col-span-5"
                initial={{ opacity: 0, scale: 0.9, rotateY: 10 }}
                animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
                style={{ 
                  transform: `perspective(1000px) rotateY(${mousePosition.x * 0.5}deg) rotateX(${-mousePosition.y * 0.5}deg)` 
                }}
              >
                <div className="relative mx-auto max-w-sm rounded-2xl border border-slate-200 bg-slate-900 p-3 shadow-2xl shadow-slate-900/10">
                  {/* Top Bar Mockup */}
                  <div className="mb-3 flex items-center justify-between px-2 text-xs text-slate-400">
                    <motion.div 
                      className="flex items-center gap-1.5"
                      animate={{ opacity: isCameraActive ? 1 : 0.5 }}
                    >
                      <motion.span 
                        className="h-2 w-2 rounded-full bg-emerald-500"
                        animate={{ 
                          scale: isCameraActive ? [1, 1.3, 1] : 1,
                          opacity: isCameraActive ? [1, 0.5, 1] : 0.5
                        }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                      />
                      <span>Kamera Aktif</span>
                    </motion.div>
                    <motion.span 
                      animate={{ opacity: isCameraActive ? 1 : 0.3 }}
                    >
                      FPS: 30
                    </motion.span>
                  </div>

                  {/* Viewport Camera Mockup */}
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-800 flex flex-col items-center justify-center border border-slate-700">
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent z-10" />
                    
                    {/* Scanning Line Effect */}
                    <motion.div 
                      className="absolute left-0 right-0 h-0.5 bg-blue-500/60 z-20"
                      animate={{ 
                        top: ["0%", "100%", "0%"],
                        opacity: [0.3, 0.8, 0.3]
                      }}
                      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                    />
                    
                    {/* Bounding Box Visualizer */}
                    <motion.div 
                      className="relative z-0 flex flex-col items-center"
                      animate={{ scale: [1, 1.02, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <div className="relative h-28 w-28 rounded-lg border-2 border-dashed border-blue-400/80 p-1 flex items-center justify-center">
                        <motion.div
                          animate={{ 
                            scale: [1, 1.1, 1],
                            rotate: [0, 5, -5, 0]
                          }}
                          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <ScanFace className="h-16 w-16 text-slate-400" />
                        </motion.div>
                        {/* Corner markers */}
                        {["-top-1 -left-1 border-t-2 border-l-2", 
                          "-top-1 -right-1 border-t-2 border-r-2",
                          "-bottom-1 -left-1 border-b-2 border-l-2",
                          "-bottom-1 -right-1 border-b-2 border-r-2"].map((pos, i) => (
                          <motion.div 
                            key={i}
                            className={`absolute ${pos} h-3 w-3 border-blue-500`}
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
                          />
                        ))}
                      </div>
                    </motion.div>

                    {/* Overlay Status */}
                    <motion.div 
                      className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between rounded-lg bg-slate-900/90 backdrop-blur border border-slate-700/80 px-3 py-2 text-xs text-white"
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.8 }}
                    >
                      <div>
                        <motion.p 
                          className="font-semibold text-emerald-400"
                          animate={{ color: ["#34d399", "#6ee7b7", "#34d399"] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          Terverifikasi
                        </motion.p>
                        <p className="text-[10px] text-slate-300">Ahmad Fauzi (8B)</p>
                      </div>
                      <motion.span 
                        className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300 font-mono"
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        0.18s
                      </motion.span>
                    </motion.div>
                  </div>

                  {/* Bottom Stats */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                    <motion.div 
                      className="rounded-lg bg-slate-800/60 p-2 text-slate-300"
                      whileHover={{ backgroundColor: "rgba(30,58,138,0.3)" }}
                    >
                      <span className="block text-[10px] text-slate-400">Akurasi Jarak</span>
                      <span className="font-mono font-semibold text-blue-400">Euclidean &lt; 0.6</span>
                    </motion.div>
                    <motion.div 
                      className="rounded-lg bg-slate-800/60 p-2 text-slate-300"
                      whileHover={{ backgroundColor: "rgba(16,185,129,0.2)" }}
                    >
                      <span className="block text-[10px] text-slate-400">Status Database</span>
                      <motion.span 
                        className="font-mono font-semibold text-emerald-400"
                        animate={{ opacity: [0.7, 1, 0.7] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        Terhubung
                      </motion.span>
                    </motion.div>
                  </div>
                </div>
              </motion.div>

            </div>
          </div>
        </section>

        {/* ===== FITUR UTAMA ===== */}
        <section id="fitur" className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <AnimatedSection className="mb-12 text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Fitur Dirancang Khusus untuk Sekolah
                </h2>
                <p className="mt-2 text-slate-600 text-sm sm:text-base max-w-xl mx-auto">
                  Efisiensi pengelolaan data siswa dan kehadiran dalam satu dashboard terintegrasi.
                </p>
              </motion.div>
            </AnimatedSection>

            <motion.div 
              className="grid gap-6 md:grid-cols-3"
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
            >
              {features.map((feature, index) => {
                const colors = colorMap[feature.color as keyof typeof colorMap];
                const Icon = feature.icon;
                const isHighlight = feature.highlight;
                
                return (
                  <motion.div
                    key={index}
                    variants={fadeInScale}
                    className={isHighlight ? "md:col-span-2" : ""}
                    onHoverStart={() => setHoveredFeature(index)}
                    onHoverEnd={() => setHoveredFeature(null)}
                  >
                    <motion.div
                      className={`relative rounded-xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm overflow-hidden ${
                        isHighlight ? "md:col-span-2 bg-gradient-to-br from-white to-slate-50" : ""
                      }`}
                      whileHover={{ 
                        y: -6,
                        boxShadow: "0 20px 40px -12px rgba(0,0,0,0.15)",
                        transition: { duration: 0.2 }
                      }}
                    >
                      {/* Glow effect on hover */}
                      <motion.div 
                        className={`absolute -inset-1 bg-gradient-to-r from-${feature.color}-500/10 to-${feature.color}-600/10 rounded-xl blur-2xl`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: hoveredFeature === index ? 1 : 0 }}
                        transition={{ duration: 0.3 }}
                      />
                      
                      <div className="relative z-10">
                        <motion.div 
                          className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.bg} ${colors.text} mb-4`}
                          whileHover={{ 
                            scale: 1.1,
                            rotate: [0, -5, 5, 0],
                            transition: { duration: 0.3 }
                          }}
                        >
                          <Icon className="h-5 w-5" />
                        </motion.div>
                        
                        <h3 className={`text-lg font-bold text-slate-900 ${isHighlight ? "text-xl" : ""}`}>
                          {feature.title}
                        </h3>
                        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                          {feature.description}
                        </p>
                        
                        {feature.tags && (
                          <motion.div 
                            className="mt-6 flex flex-wrap gap-2"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                          >
                            {feature.tags.map((tag, i) => (
                              <motion.span 
                                key={i}
                                className={`rounded-md ${colors.bg} px-2.5 py-1 text-xs font-medium ${colors.text}`}
                                whileHover={{ scale: 1.05 }}
                              >
                                {tag}
                              </motion.span>
                            ))}
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>

        {/* ===== WORKFLOW SECTION ===== */}
        <section className="border-t border-slate-200 bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <AnimatedSection className="mb-14 text-center">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                Tiga Langkah Praktis Presensi
              </h2>
              <p className="mt-2 text-slate-600 text-sm sm:text-base">
                Proses cepat yang memudahkan guru dan siswa setiap harinya.
              </p>
            </AnimatedSection>

            <div className="grid gap-8 md:grid-cols-3 relative">
              {/* Connecting line */}
              <div className="hidden md:block absolute top-1/3 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-blue-200 via-blue-300 to-blue-200" />
              <motion.div 
                className="hidden md:block absolute top-1/3 left-[16%] right-[16%] h-0.5"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 1, delay: 0.5 }}
              >
                <motion.div 
                  className="h-full w-3 bg-blue-600 rounded-full"
                  animate={{ x: ["0%", "100%", "0%"] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
              </motion.div>

              {[
                { step: "01", title: "Registrasi Wajah Siswa", desc: "Unggah foto siswa saat pendaftaran awal. Sistem akan membuat enkoding numerik khusus.", icon: Camera },
                { step: "02", title: "Buka Sesi Presensi", desc: "Guru/Administrator mengaktifkan sesi presensi pada kelas dan mata pelajaran yang berlangsung.", icon: Clock },
                { step: "03", title: "Scan & Terdeteksi", desc: "Siswa cukup menghadap ke kamera. Kehadiran akan langsung tercatat di database harian.", icon: Zap }
              ].map((item, index) => (
                <motion.div
                  key={index}
                  className="relative rounded-xl border border-slate-100 bg-slate-50/50 p-6 group"
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.15, duration: 0.5 }}
                  whileHover={{ 
                    y: -4,
                    boxShadow: "0 12px 30px -8px rgba(0,0,0,0.08)",
                    borderColor: "#60a5fa",
                    transition: { duration: 0.2 }
                  }}
                >
                  <motion.div 
                    className="mb-4 text-xs font-bold text-blue-600 font-mono tracking-wider flex items-center gap-2"
                    whileHover={{ x: 5 }}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-sm font-bold">
                      {item.step}
                    </span>
                    <span className="text-slate-400 font-normal">LANGKAH {item.step}</span>
                  </motion.div>
                  <h3 className="text-base font-bold text-slate-900">{item.title}</h3>
                  <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                    {item.desc}
                  </p>
                  <motion.div 
                    className="absolute -right-2 -top-2 h-12 w-12 rounded-full bg-blue-500/5 flex items-center justify-center"
                    whileHover={{ scale: 1.1, rotate: 10 }}
                  >
                    <item.icon className="h-5 w-5 text-blue-400/40" />
                  </motion.div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== CTA SECTION ===== */}
        <section className="bg-slate-900 py-16 text-white relative overflow-hidden">
          {/* Background particle effect */}
          <motion.div 
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
          >
            {particleData.map((p) => (
              <motion.div
                key={p.id}
                className="absolute h-1 w-1 bg-white/10 rounded-full"
                style={{
                  left: `${p.left}%`,
                  top: `${p.top}%`,
                }}
                animate={{
                  y: [0, -30, 0],
                  opacity: [0.2, 0.6, 0.2],
                }}
                transition={{
                  duration: p.duration,
                  repeat: Infinity,
                  delay: p.delay,
                  ease: "easeInOut"
                }}
              />
            ))}
          </motion.div>
          
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <motion.div
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="inline-block mb-4"
              >
                <ShieldCheck className="h-12 w-12 text-blue-400 mx-auto" />
              </motion.div>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                Siap Memulai Presensi Berbasis Digital?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-slate-400 text-sm sm:text-base">
                Akses panel admin dan guru untuk mulai mengelola kehadiran siswa SMP Aisyiyah Paccinongang.
              </p>
              <motion.div 
                className="mt-8"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <Link href="/login">
                  <Button size="lg" className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-8 shadow-lg shadow-blue-600/30 group relative overflow-hidden">
                    <span className="relative z-10 flex items-center">
                      Masuk ke Dashboard
                      <ChevronRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </span>
                    <motion.span 
                      className="absolute inset-0 bg-gradient-to-r from-blue-600 to-blue-800"
                      initial={{ x: "-100%" }}
                      whileHover={{ x: 0 }}
                      transition={{ duration: 0.4 }}
                    />
                  </Button>
                </Link>
              </motion.div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* ===== FOOTER ===== */}
      <motion.footer 
        className="border-t border-slate-200 bg-white py-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <div className="mx-auto max-w-6xl px-4 text-center text-xs text-slate-500 sm:px-6">
          <p>© {new Date().getFullYear()} SMP Aisyiyah Paccinongang. All rights reserved.</p>
          <motion.p 
            className="mt-1 text-[11px] text-slate-400"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            Powered by Computer Vision Technology (YOLOv8 & FaceNet)
          </motion.p>
        </div>
      </motion.footer>
    </div>
  );
}