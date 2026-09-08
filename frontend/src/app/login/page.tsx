"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ScanFace, ArrowLeft, Loader2, AlertCircle, Eye, EyeOff, Lock, Mail } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Gagal masuk. Periksa kembali email dan password Anda.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-50/50 text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      
      {/* Top Bar Navigation */}
      <div className="p-4 sm:p-6">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors rounded-lg px-3 py-2 hover:bg-slate-200/50"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Kembali ke Beranda</span>
        </Link>
      </div>

      {/* Main Container */}
      <div className="flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md border-slate-200/80 shadow-xl shadow-slate-200/50 bg-white">
          <CardHeader className="space-y-3 text-center pb-6">
            
            {/* Logo Badge */}
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 font-semibold text-white shadow-md shadow-blue-500/20">
              <ScanFace className="h-6 w-6" />
            </div>

            <div className="space-y-1">
              <CardTitle className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                PresensiWajah
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm text-slate-500">
                Sistem Presensi SMP Aisyiyah Paccinongang
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Error State */}
            {error && (
              <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Field Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-slate-700">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="nama@smpaisyiyah.sch.id"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 text-sm border-slate-200 focus-visible:ring-blue-600"
                    required
                  />
                </div>
              </div>

              {/* Field Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium text-slate-700">
                    Password
                  </Label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-10 text-sm border-slate-200 focus-visible:ring-blue-600"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <Button 
                type="submit" 
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md shadow-blue-600/20 mt-2" 
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Memverifikasi...
                  </>
                ) : (
                  "Masuk Sistem"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Footer minimalis */}
      <div className="p-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} SMP Aisyiyah Paccinongang
      </div>
    </div>
  );
}