'use client';
import { useState } from 'react';

export default function Home() {
  const [transacoes, setTransacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/parse-invoice', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();
      if (result.success) {
        setTransacoes(result.dados);
      } else {
        alert('Não foi possível ler este arquivo de fatura.');
      }
    } catch (err) {
      alert('Erro ao enviar o arquivo.');
    } finally {
      setLoading(false);
    }
  };

  const totalGasto = transacoes.reduce((acc, curr) => acc + curr.valor, 0);

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h1 style={{ color: '#2563eb', fontSize: '2.5rem', marginBottom: '0.5rem' }}>FaturAí</h1>
        <p style={{ color: '#4b5563' }}>Contabilizador de faturas e cartões de crédito em nuvem.</p>
      </header>

      <section style={{ margin: '2rem 0', padding: '2rem', border: '2px dashed #3b82f6', borderRadius: '12px', textAlign: 'center', backgroundColor: '#eff6ff' }}>
        <h3 style={{ marginTop: 0, color: '#1e40af' }}>Carregar Fatura do Mês</h3>
        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Selecione o arquivo PDF da fatura para extrair e contabilizar os gastos.</p>
        <input 
          type="file" 
          accept="application/pdf" 
          onChange={handleFileUpload} 
          disabled={loading} 
          style={{ marginTop: '1rem', padding: '0.5rem' }} 
        />
        {loading && <p style={{ marginTop: '1rem', color: '#2563eb', fontWeight: 'bold' }}>Lendo fatura...</p>}
      </section>

      {transacoes.length > 0 && (
        <section style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '0.5rem', borderBottom: '2px solid #e5e7eb' }}>
            <h2 style={{ margin: 0, color: '#1f2937' }}>Lançamentos ({transacoes.length})</h2>
            <h3 style={{ margin: 0, color: '#dc2626' }}>Total: R$ {totalGasto.toFixed(2)}</h3>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {transacoes.map((item, index) => (
              <li
                key={index}
                style={{
                  padding: '1rem',
                  marginBottom: '0.5rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong style={{ color: '#111827', display: 'block' }}>{item.descricao}</strong>
                  <small style={{ color: '#6b7280' }}>Data: {item.data}</small>
                </div>
                <span style={{ fontWeight: 'bold', color: '#dc2626', fontSize: '1.1rem' }}>
                  R$ {item.valor.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
