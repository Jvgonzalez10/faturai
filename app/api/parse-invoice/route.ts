import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Renderiza o texto mantendo a estrutura nativa
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text || '';

    if (!text.trim()) {
      return NextResponse.json({ error: 'Nenhum texto foi encontrado no PDF.' }, { status: 400 });
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const transacoes: Array<{ data: string; descricao: string; valor: number }> = [];

    // Regex flexível: Data DD/MM + Descrição + Valor (aceita sinal de - e sufixo de estorno)
    const regexTransacao = /(\d{2}\/\d{2})\s+(.+?)\s+(-?\s*[\d\.]+\,\d{2}\s*-?)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Ignora cabecalhos e linhas de saldo anterior / pagamentos efetuados
      if (
        line.includes('Pagamento via conta') ||
        line.includes('Total dos pagamentos') ||
        line.includes('PAGAMENTO EFETUADO') ||
        line.includes('RESUMO DA FATURA') ||
        line.includes('Vencimento') ||
        line.includes('Total desta fatura') ||
        line.includes('SALDO ANTERIOR') ||
        line.includes('ESTABELECIMENTO')
      ) {
        continue;
      }

      const match = line.match(regexTransacao);

      if (match) {
        const [_, data, desc, valorStr] = match;

        // Identifica estorno/crédito
        const isNegative = valorStr.includes('-');
        let cleanVal = valorStr.replace('-', '').replace(/\./g, '').replace(',', '.').trim();
        let valor = parseFloat(cleanVal);

        if (!isNaN(valor) && valor > 0 && desc.trim().length > 1) {
          if (isNegative) {
            valor = -Math.abs(valor);
          }

          transacoes.push({
            data,
            descricao: desc.trim(),
            valor,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: transacoes.length,
      dados: transacoes,
    });
  } catch (error) {
    console.error('Erro no processamento do PDF:', error);
    return NextResponse.json({ error: 'Erro interno ao processar a fatura.' }, { status: 500 });
  }
}
