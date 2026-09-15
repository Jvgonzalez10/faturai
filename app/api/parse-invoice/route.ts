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
      pdfParser.on('pdfParser_dataReady', (pdfData: any) => resolve(pdfData));
      pdfParser.parseBuffer(buffer);
    });

    const transacoes: Array<{ data: string; descricao: string; valor: number }> = [];

    // Percorre cada pagina do PDF
    for (const page of parsedData.Pages) {
      const texts = page.Texts;
      
      // Agrupa os elementos de texto pela posicao Y (mesma linha visual)
      const rows: { [key: number]: Array<{ x: number; text: string }> } = {};

      for (const t of texts) {
        const y = Math.round(t.y * 10) / 10; // Arredonda coordenada Y
        const textStr = decodeURIComponent(t.R[0].T).trim();

        if (!rows[y]) {
          rows[y] = [];
        }
        rows[y].push({ x: t.x, text: textStr });
      }

      // Processa cada linha visual
      for (const yKey of Object.keys(rows)) {
        const rowItems = rows[Number(yKey)].sort((a, b) => a.x - b.x);
        const fullLine = rowItems.map((item) => item.text).join(' ');

        // Ignora pagamentos de fatura anteriores e resumos
        if (fullLine.includes('Pagamento via conta') || fullLine.includes('Total dos pagamentos')) {
          continue;
        }

        // Procura por padrão: Data (DD/MM) + Descrição + Valor (ex: 12/08 SUHAI SEGURO 189,72)
        const match = fullLine.match(/^(\d{2}\/\d{2})\s+(.+?)\s+([\d\.,]+)$/);

        if (match) {
          const [_, data, descricao, valorStr] = match;

          // Filtra palavras-chave do cabeçalho do Itaú
          if (
            descricao.includes('ESTABELECIMENTO') ||
            descricao.includes('VALOR') ||
            descricao.includes('Lançamentos')
          ) {
            continue;
          }

          let valorClean = valorStr;
          if (valorClean.includes(',') && valorClean.includes('.')) {
            valorClean = valorClean.replace('.', '').replace(',', '.');
          } else if (valorClean.includes(',')) {
            valorClean = valorClean.replace(',', '.');
          }

          const valor = parseFloat(valorClean);

          if (!isNaN(valor) && valor > 0) {
            transacoes.push({
              data,
              descricao: descricao.trim(),
              valor,
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true, count: transacoes.length, dados: transacoes });
  } catch (error) {
    console.error('Erro ao processar PDF:', error);
    return NextResponse.json({ error: 'Erro ao processar o arquivo da fatura' }, { status: 500 });
  }
}
