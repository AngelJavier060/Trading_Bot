/**
 * Auto-conexión al arranque del servidor (credenciales IQ / MT5).
 */

import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { ArrowLeft, Zap } from 'lucide-react'
import AutoConnectManager from '../components/dashboard/AutoConnectManager'

export default function AutoConnectPage() {
  return (
    <>
      <Head>
        <title>Auto-Conexión | Trading Bot</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <header className="bg-white shadow-sm border-b border-slate-200">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/platform-select"
                className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
                title="Volver a elegir plataforma"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-blue-600" />
                  Auto-Conexión
                </h1>
                <p className="text-xs text-slate-500">
                  Credenciales guardadas y arranque automático del servidor
                </p>
              </div>
            </div>
            <Link
              href="/platform-select"
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-colors"
            >
              Volver a plataformas
            </Link>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-8">
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-xl">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
                  <Zap className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-2">Conexión automática</h2>
                  <p className="text-blue-100 text-sm mb-4">
                    Guarda credenciales cifradas para que el backend pueda reconectar al iniciar.
                  </p>
                  <ol className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        1
                      </span>
                      <span>Completa el formulario de IQ Option o MT5</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        2
                      </span>
                      <span>Guarda credenciales desde el panel inferior</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        3
                      </span>
                      <span>La operativa en vivo sigue en cada dashboard de plataforma</span>
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            <AutoConnectManager />

            <details className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <summary className="px-6 py-4 cursor-pointer text-sm font-bold text-slate-700 hover:text-slate-900 transition-colors">
                API auto-conexión
              </summary>
              <div className="px-6 pb-6 space-y-2 text-xs text-slate-600">
                <p>
                  <code className="bg-slate-100 px-2 py-0.5 rounded">GET /api/auto-connect/status</code>
                </p>
                <p>
                  <code className="bg-slate-100 px-2 py-0.5 rounded">POST /api/auto-connect/save-credentials</code>
                </p>
                <p>
                  <code className="bg-slate-100 px-2 py-0.5 rounded">POST /api/auto-connect/connect-now</code>
                </p>
              </div>
            </details>
          </div>
        </main>
      </div>
    </>
  )
}
