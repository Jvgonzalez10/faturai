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

    const pdfData = await pdfParse(buffer);
    const text = pdfData.text || '';

    if (!text.trim()) {
      return NextResponse.json({ error: 'Nenhum texto foi encontrado no PDF.' }, { status: 400 });
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const transacaoLista: Array<{ data: string; descricao: string; valor: number }> = [];

    // Captura data no inicio (DD/MM), estabelecimento no meio e valor no fim
    const regexLancamento = /^(\d{2}\/\d{2})\s+(.+?)\s+(-?\s*[\d\.]+\,\d{2}\s*-?)$/;

    let dentroDoExtrato = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineUpper = line.toUpperCase();

      // 1. REATIVADOR DE LEITURA: Reativa sempre que encontra novo bloco de lancamentos
      if (
        lineUpper.includes('LANÇAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANCAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANÇAMENTOS: PRODUTOS E SERVIÇOS') ||
        lineUpper.includes('LANÇAMENTOS DO CARTÃO') ||
        lineUpper.includes('LANÇAMENTOS PRODUTOS E SERVIÇOS')
      ) {
        dentroDoExtrato = true;
        continue;
      }

      // 2. CORTE DEFINITIVO: Desliga a leitura apenas quando atinge as tabelas de resumo e limites do final do PDF
      if (
        lineUpper.includes('COMPRAS PARCELADAS - PRÓXIMAS FATURAS') ||
        lineUpper.includes('COMPRAS PARCELADAS - PROXIMAS FATURAS') ||
        lineUpper.includes('LIMITES DE CRÉDITO') ||
        lineUpper.includes('NOVO TETO DE JUROS DO CARTÃO') ||
        lineUpper.includes('AUTENTICAÇÃO MECÂNICA') ||
        lineUpper.includes('FICHA DE COMPENSAÇÃO')
      ) {
        dentroDoExtrato = false;
      }

      if (!dentroDoExtrato) {
        continue;
      }

      // 3. DESCARTE DE CABEÇALHOS E LINHAS INSTITUCIONAIS DA TABELA
      if (
        lineUpper.includes('PAGAMENTO VIA CONTA') ||
        lineUpper.includes('TOTAL DOS PAGAMENTOS') ||
        lineUpper.includes('TOTAL DOS LANÇAMENTOS ATUAIS') ||
        lineUpper.includes('ESTABELECIMENTO') ||
        lineUpper.includes('PRODUTOS/SERVIÇOS') ||
        lineUpper.includes('VALOR EM R$') ||
        lineUpper.includes('DATA')
      ) {
        continue;
      }

      // 4. EXTRAÇÃO DA LINHA
      const match = line.match(regexLancamento);

      if (match) {
        const data = match[1];
        let desc = match[2].trim();
        const valorStr = match[3];

        // Ignora sublinhas de categoria do Itaú (ex: "transporte Sao Paulo", "supermercado RIO DE JANEIR")
        if (
          desc.toLowerCase().startsWith('transporte') ||
          desc.toLowerCase().startsWith('restaurante') ||
          desc.toLowerCase().startsWith('supermercado') ||
          desc.toLowerCase().startsWith('saúde') ||
          desc.toLowerCase().startsWith('educacao') ||
          desc.toLowerCase().startsWith('outros') ||
          desc.toLowerCase().startsWith('lazer') ||
          desc.toLowerCase().startsWith('serviços') ||
          desc.toLowerCase().startsWith('casa') ||
          desc.toLowerCase().startsWith('vestuário')
        ) {
          continue;
        }

        // Descarta textos explicativos do parcelamento PIX e Financiamento
        const descUpper = desc.toUpperCase();
        if (
          descUpper.includes('PRINCIPAL (') ||
          descUpper.includes('JUROS (') ||
          descUpper.includes('VALOR EM')
        ) {
          continue;
        }

        // Limpeza de marca
        desc = desc
          .replace(/-topaz/gi, '')
          .replace(/topaz/gi, '')
          .replace(/R\$/g, '')
          .trim();

        if (desc.length < 2) continue;

        const isNegative = valorStr.includes('-');
        let cleanVal = valorStr.replace('-', '').replace(/\./g, '').replace(',', '.').trim();
        let valor = parseFloat(cleanVal);

        if (!isNaN(valor) && valor > 0 && valor < 5000) {
          if (isNegative) {
            valor = -Math.abs(valor);
          }

          transacaoLista.push({
            data,
            descricao: desc,
            valor,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: transacaoLista.length,
      dados: transacaoLista,
    });
  } catch (error) {
    console.error('Erro no processamento do PDF:', error);
    return NextResponse.json({ error: 'Erro interno ao processar a fatura.' }, { status: 500 });
  }
}
