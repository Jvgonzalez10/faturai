'use client';

import { useState } from 'react';

interface Transacao {
  data: string;
  descricao: string;
  valor: number;
}

export default function Home() {
  const [transacaoLista, setTransacaoLista] = useState<Transacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const processFile = async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      alert('Por favor, envie um arquivo PDF valido.');
      return;
    }

    setFileName(file.name);
    setLoading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/parse-invoice', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();
      if (result.success && result.dados) {
        setTransacaoLista(result.dados);
      } else {
        alert('Nao foi possivel processar a fatura. Tente outro arquivo.');
      }
    } catch (err) {
      alert('Erro de conexao ao enviar o arquivo.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const totalGasto = transacaoLista.reduce((acc, curr) => acc + curr.valor, 0);
  const maiorGasto = transacaoLista.length > 0 ? Math.max(...transacaoLista.map((t) => t.valor)) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))]">
      <div className="max-w-5xl mx-auto px-6 py-10 md:py-16">
        
        {/* Topbar / Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 pb-6 border-b border-slate-800/80 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20 ring-1 ring-white/20">
                F
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
                FaturAi
              </h1>
            </div>
            <p className="text-slate-400 text-sm mt-1.5 font-normal">
              Gestao visual e inteligencia de fatura de cartao
            </p>
          </div>

          {transacaoLista.length > 0 && (
            <button
              onClick={() => {
                setTransacaoLista([]);
                setFileName(null);
              }}
              className="text-xs bg-slate-900/80 hover:bg-slate-800 text-slate-300 font-medium px-4 py-2.5 rounded-xl border border-slate-800 shadow-sm transition-all duration-200 active:scale-95"
            >
              Limpar Dado
            </button>
          )}
        </header>

        {/* Area de Dropzone */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`relative border border-dashed rounded-3xl p-10 text-center transition-all duration-300 mb-10 backdrop-blur-xl ${
            dragActive
              ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01] shadow-2xl shadow-indigo-500/10'
              : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/60 shadow-xl'
          }`}
        >
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            disabled={loading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />

          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50 shadow-inner">
              <svg
                className="w-7 h-7 text-indigo-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.75"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>

            <div>
              <p className="text-base font-semibold text-slate-200">
                {fileName ? (
                  <span className="text-indigo-400 font-bold">{fileName}</span>
                ) : (
                  'Arraste a fatura em PDF aqui ou clique para selecionar'
                )}
              </p>
              <p className="text-xs text-slate-400 mt-1">Suporta arquivo PDF de fatura de cartao de credito</p>
            </div>

            {loading && (
              <div className="flex items-center space-x-3 text-indigo-400 font-medium text-xs pt-3">
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-400 border-t-transparent"></span>
                <span>Processando e extraindo lancamento...</span>
              </div>
            )}
          </div>
        </div>

        {/* Dashboard de Resultados */}
        {transacaoLista.length > 0 && (
          <div className="space-y-8 animate-fade-in">
            {/* Cards Indicadores */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-gradient-to-b from-slate-900/80 to-slate-900/40 border border-slate-800/80 p-6 rounded-2xl backdrop-blur-xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total da Fatura</p>
                <p className="text-3xl font-extrabold text-white mt-2 tracking-tight">
                  R$ {totalGasto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div className="bg-gradient-to-b from-slate-900/80 to-slate-900/40 border border-slate-800/80 p-6 rounded-2xl backdrop-blur-xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Maior Lancamento</p>
                <p className="text-3xl font-extrabold text-white mt-2 tracking-tight">
                  R$ {maiorGasto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            {/* Tabela de Lancamentos */}
            <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl">
              <div className="px-6 py-5 border-b border-slate-800/80 flex justify-between items-center bg-slate-900/30">
                <h2 className="font-bold text-slate-100 text-base">Lancamento Encontrado</h2>
                <span className="text-xs bg-indigo-500/10 text-indigo-400 font-semibold px-3 py-1 rounded-full border border-indigo-500/20">
                  {transacaoLista.length} item
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950/60 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/80">
                    <tr>
                      <th className="px-6 py-4">Data</th>
                      <th className="px-6 py-4">Estabelecimento</th>
                      <th className="px-6 py-4 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {transacaoLista.map((item, index) => (
                      <tr key={index} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-slate-400 font-mono text-xs">
                          {item.data}
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-200">{item.descricao}</td>
                        <td className="px-6 py-4 text-right font-bold text-slate-100">
                          R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
