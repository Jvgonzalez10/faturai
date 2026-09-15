import { NextResponse } from 'next/server';
import { extractText } from 'unpdf';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { text } = await extractText(buffer);
    const fullText = Array.isArray(text) ? text.join('\n') : text;

    if (!fullText || fullText.trim().length === 0) {
      return NextResponse.json({ error: 'Nenhum texto foi encontrado no PDF.' }, { status: 400 });
    }

    const lines = fullText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const transacoes: Array<{ data: string; descricao: string; valor: number }> = [];

    // Regex para capturar data, descricao e valor (prevendo sinal negativo ou sufixo -/CR)
    const regexLinha = /^(\d{2}\/\d{2})\s+(.+?)\s+(-?\s*[\d\.]+\,\d{2}\s*-?)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Ignora cabecalhos, resumos e pagamentos do mes anterior que nao entram nos lancamentos atuais
      if (
        line.includes('Pagamento via conta') ||
        line.includes('Total dos pagamentos') ||
        line.includes('PAGAMENTO EFETUADO') ||
        line.includes('RESUMO DA FATURA') ||
        line.includes('Vencimento') ||
        line.includes('Total desta fatura') ||
        line.includes('SALDO ANTERIOR')
      ) {
        continue;
      }

      const match = line.match(regexLinha);

      if (match) {
        const [_, data, desc, valorStr] = match;

        // Ignora titulos de coluna da tabela
        if (desc.includes('ESTABELECIMENTO') || desc.includes('VALOR')) {
          continue;
        }

        // Verifica se e um estorno/credito (possui o simbolo de menos)
        const isNegative = valorStr.includes('-');
        
        let valorClean = valorStr.replace('-', '').replace(/\./g, '').replace(',', '.').trim();
        let valor = parseFloat(valorClean);

        if (!isNaN(valor) && valor !== 0 && desc.length > 1) {
          // Aplica o sinal negativo se for estorno
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
