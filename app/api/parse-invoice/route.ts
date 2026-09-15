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

    // Processa pagina por pagina
    for (const page of parsedData.Pages) {
      // Objeto para agrupar textos pelo alinhamento vertical (Y)
      const rows: { [key: number]: Array<{ x: number; text: string }> } = {};

      for (const t of page.Texts) {
        // Tolerancia de alinhamento vertical (arredonda Y para agrupar itens da mesma linha)
        const y = Math.round(t.y * 5) / 5;
        
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

      // Ordena cada linha da esquerda para a direita (coordenada X)
      const sortedY = Object.keys(rows).map(Number).sort((a, b) => a - b);

      for (const y of sortedY) {
        const rowItems = rows[y].sort((a, b) => a.x - b.x);
        const lineText = rowItems.map((item) => item.text).join(' ');

        // Ignora resumos, limites e pagamentos
        if (
          lineText.includes('Pagamento via conta') ||
          lineText.includes('Total dos pagamentos') ||
          lineText.includes('ESTABELECIMENTO') ||
          lineText.includes('Lançamentos')
        ) {
          continue;
        }

        // Busca padroes do Itau: [Data DD/MM] [Estabelecimento] [Valor ex: 189,72]
        const match = lineText.match(/^(\d{2}\/\d{2})\s+(.+?)\s+([\d\.,]+)$/);

        if (match) {
          const [_, data, descricao, valorStr] = match;

          // Limpa formatação monetária brasileira
          let cleanVal = valorStr;
          if (cleanVal.includes(',') && cleanVal.includes('.')) {
            cleanVal = cleanVal.replace(/\./g, '').replace(',', '.');
          } else if (cleanVal.includes(',')) {
            cleanVal = cleanVal.replace(',', '.');
          }

          const valor = parseFloat(cleanVal);

          if (!isNaN(valor) && valor > 0 && descricao.length > 2) {
            transacoes.push({
              data,
              descricao: descricao.trim(),
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
    console.error('Erro ao processar PDF:', error);
    return NextResponse.json({ error: 'Erro ao processar o arquivo da fatura' }, { status: 500 });
  }
}
