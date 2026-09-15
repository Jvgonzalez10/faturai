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

    // Exige estritamente: Data no inicio (DD/MM), Texto do estabelecimento no meio e Valor no fim
    const regexLinhaTransacao = /^(\d{2}\/\d{2})\s+(.+?)\s+(-?\s*[\d\.]+\,\d{2}\s*-?)$/;

    let dentroDoExtrato = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineUpper = line.toUpperCase();

      // 1. ANCORA DE INICIO: Entra no extrato no cabecalho
      if (
        lineUpper.includes('LANÇAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANCAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANÇAMENTOS: PRODUTOS E SERVIÇOS')
      ) {
        dentroDoExtrato = true;
        continue;
      }

      // 2. ANCORA DE FIM: Corta a leitura antes das tabelas auxiliares
      if (
        lineUpper.includes('COMPRAS PARCELADAS') ||
        lineUpper.includes('LIMITES DE CRÉDITO') ||
        lineUpper.includes('ENCARGOS COBRADOS') ||
        lineUpper.includes('OUTRA OPÇÃO DE PAGAMENTO') ||
        lineUpper.includes('PARCELAS FIXAS') ||
        lineUpper.includes('CASO VOCÊ PAGUE')
      ) {
        dentroDoExtrato = false;
      }

      if (!dentroDoExtrato) {
        continue;
      }

      // 3. FILTROS DE CABEÇALHO E TOTALIZADORES
      if (
        lineUpper.includes('PAGAMENTO VIA CONTA') ||
        lineUpper.includes('TOTAL DOS PAGAMENTOS') ||
        lineUpper.includes('LANÇAMENTOS NO CARTÃO') ||
        lineUpper.includes('LANÇAMENTOS PRODUTOS E SERVIÇOS') ||
        lineUpper.includes('TOTAL DOS LANÇAMENTOS ATUAIS') ||
        lineUpper.includes('ESTABELECIMENTO') ||
        lineUpper.includes('PRODUTOS/SERVIÇOS') ||
        lineUpper.includes('VALOR EM R$') ||
        lineUpper.includes('DATA')
      ) {
        continue;
      }

      // 4. VALIDACAO E EXTRAÇÃO ESTRITA
      const match = line.match(regexLinhaTransacao);

      if (match) {
        const data = match[1];
        let desc = match[2].trim();
        const valorStr = match[3];

        // Filtro de palavras do sistema/explicativas do Itau
        const descUpper = desc.toUpperCase();
        if (
          descUpper.includes('PRINCIPAL (') ||
          descUpper.includes('JUROS (') ||
          descUpper.includes('VALOR EM') ||
          descUpper.includes('PREVISÃO') ||
          descUpper.includes('SUBTOTAL') ||
          desc.length < 2
        ) {
          continue;
        }

        // Limpeza do nome do estabelecimento
        desc = desc
          .replace(/-topaz/gi, '')
          .replace(/topaz/gi, '')
          .replace(/R\$/g, '')
          .trim();

        const isNegative = valorStr.includes('-');
        let cleanVal = valorStr.replace('-', '').replace(/\./g, '').replace(',', '.').trim();
        let valor = parseFloat(cleanVal);

        if (!isNaN(valor) && valor > 0) {
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
