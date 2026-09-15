import { NextResponse } from 'next/server';
import PDFParser from 'pdf2json';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const parsedData = await new Promise<any>((resolve, reject) => {
      const pdfParser = new (PDFParser as any)();
      pdfParser.on('pdfParser_dataError', (errData: any) => reject(errData.parserError));
      pdfParser.parseBuffer(buffer);
      pdfParser.on('pdfParser_dataReady', (pdfData: any) => resolve(pdfData));
    });

    const transacoes: Array<{ data: string; descricao: string; valor: number }> = [];

    // Mapeia todas as paginas do PDF
    for (const page of parsedData.Pages) {
      const rows: { [key: number]: Array<{ x: number; text: string }> } = {};

      // Agrupa blocos de texto por coordenada Y (mesma linha visual)
      for (const t of page.Texts) {
        const y = Math.round(t.y * 4) / 4; // Tolerancia de alinhamento
        let textStr = '';

        try {
          textStr = decodeURIComponent(t.R[0].T).trim();
        } catch {
          textStr = t.R[0].T.trim();
        }

        if (!textStr) continue;

        if (!rows[y]) {
          rows[y] = [];
        }
        rows[y].push({ x: t.x, text: textStr });
      }

      // Processa linha por linha da esquerda para a direita
      const sortedY = Object.keys(rows).map(Number).sort((a, b) => a - b);

      for (const y of sortedY) {
        const rowItems = rows[y].sort((a, b) => a.x - b.x);
        const lineText = rowItems.map((item) => item.text).join(' ');

        // Ignora pagamentos de fatura anterior e cabecalhos do Itau
        if (
          lineText.includes('Pagamento via conta') ||
          lineText.includes('Total dos pagamentos') ||
          lineText.includes('PAGAMENTO EFETUADO') ||
          lineText.includes('RESUMO DA FATURA') ||
          lineText.includes('ESTABELECIMENTO') ||
          lineText.includes('SALDO ANTERIOR')
        ) {
          continue;
        }

        // Procura: [DD/MM] [NOME LOJA] [VALOR (ex: 120,50 ou -120,50)]
        const match = lineText.match(/^(\d{2}\/\d{2})\s+(.+?)\s+(-?\s*[\d\.]+\,\d{2}\s*-?)$/);

        if (match) {
          const [_, data, desc, valorStr] = match;

          const isNegative = valorStr.includes('-');
          let cleanVal = valorStr.replace('-', '').replace(/\./g, '').replace(',', '.').trim();
          let valor = parseFloat(cleanVal);

          if (!isNaN(valor) && valor > 0 && desc.length > 1) {
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
