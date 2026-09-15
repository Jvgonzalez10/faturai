'use client';

import { useState } from 'react';

interface Transacao {
  data: string;
  descricao: string;
  valor: number;
}

export default function Home() {
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const processFile = async (file: File) => {
    if (!file || file.type !== 'application/pdf') {
      alert('Por favor, envie um arquivo PDF válido.');
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
        setTransacoes(result.dados);
      } else {
        alert('Não foi possível processar a fatura. Tente outro arquivo.');
      }
    } catch (err) {
      alert('Erro de conexão ao enviar o arquivo.');
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

  const totalGasto = transacoes.reduce((acc, curr) => acc + curr.valor, 0);
  const maiorGasto = transacoes.length > 0 ? Math.max(...transacoes.map((t) => t.valor)) : 0;
  const ticketMedio = transacoes.length > 0 ? totalGasto / transacoes.length : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      {/* Cabeçalho */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 pb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/30">
              F
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">FaturAi</h1>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Gestão visual e inteligência de faturas de cartão
          </p>
        </div>

        {transacoes.length > 0 && (
          <button
            onClick={() => {
              setTransacoes([]);
              setFileName(null);
            }}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-4 py-2 rounded-lg border border-slate-700 transition"
          >
            Limpar Dados
          </button>
        )}
      </header>

      {/* Área de Dropzone */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 mb-10 ${
          dragActive
            ? 'border-blue-500 bg-blue-500/10 scale-[1.01]'
            : 'border-slate-700 hover:border-slate-500 bg-slate-800/40'
        }`}
      >
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={loading}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="p-3 bg-slate-800 rounded-full border border-slate-700">
            <svg
              className="w-6 h-6 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-200">
              {fileName ? (
                <span className="text-blue-400 font-semibold">{fileName}</span>
              ) : (
                'Arraste a fatura em PDF aqui ou clique para selecionar'
              )}
            </p>
            <p className="text-xs text-slate-500 mt-1">Suporta arquivos PDF de faturas de cartão de crédito</p>
          </div>

          {loading && (
            <div className="flex items-center space-x-2 text-blue-400 font-medium text-xs pt-2">
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent"></span>
              <span>Processando e extraindo lançamentos...</span>
            </div>
          )}
        </div>
      </div>

      {/* Painel de Resultados */}
      {transacoes.length > 0 && (
        <div className="space-y-8 animate-fade-in">
          {/* Cards Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-xl">
              <p className="text-xs font-medium text-slate-400">Total da Fatura</p>
              <p className="text-2xl font-bold text-red-400 mt-1">
                R$ {totalGasto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-xl">
              <p className="text-xs font-medium text-slate-400">Maior Lançamento</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">
                R$ {maiorGasto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-xl">
              <p className="text-xs font-medium text-slate-400">Ticket Médio</p>
              <p className="text-2xl font-bold text-blue-400 mt-1">
                R$ {ticketMedio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Tabela de Lançamentos */}
          <div className="bg-slate-800/40 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm">
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
              <h2 className="font-semibold text-slate-200">Lançamentos Encontrados</h2>
              <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full border border-slate-700">
                {transacoes.length} itens
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-800/80 text-xs uppercase text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3">Data</th>
                    <th className="px-6 py-3">Estabelecimento</th>
                    <th className="px-6 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {transacoes.map((item, index) => (
                    <tr key={index} className="hover:bg-slate-800/30 transition">
                      <td className="px-6 py-3.5 whitespace-nowrap text-slate-400 font-mono text-xs">
                        {item.data}
                      </td>
                      <td className="px-6 py-3.5 font-medium text-slate-200">{item.descricao}</td>
                      <td className="px-6 py-3.5 text-right font-semibold text-slate-100">
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
  );
}
