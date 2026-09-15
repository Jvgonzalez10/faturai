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

    let dentroDoExtrato = false;

    // Captura flexivel: Data (DD/MM) + Descrição (com espacos variados) + Valor no final
    const regexLinhaItau = /^(\d{2}\/\d{2})\s+([\s\S]+?)\s+(-?\s*[\d\.]+\,\d{2}\s*-?)$/;

    const ignorarCategorias = [
      'TRANSPORTE', 'RESTAURANTE', 'SUPERMERCADO', 'SAÚDE', 'SAUDE',
      'EDUCACAO', 'EDUCAÇÃO', 'OUTROS', 'LAZER', 'SERVIÇOS', 'SERVICOS',
      'CASA', 'VESTUÁRIO', 'VESTUARIO', 'SUPERMARKET'
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineUpper = line.toUpperCase();

      // 1. ÁREA DE INTERESSE: Ativa a leitura no extrato do Itau
      if (
        lineUpper.includes('LANÇAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANCAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANÇAMENTOS: PRODUTOS E SERVIÇOS') ||
        lineUpper.includes('LANÇAMENTOS PRODUTOS E SERVIÇOS') ||
        lineUpper.includes('LANÇAMENTOS DO CARTÃO')
      ) {
        dentroDoExtrato = true;
        continue;
      }

      // 2. CORTE DE SEGURANÇA: Para antes das secoes de parcelas futuras e limites
      if (
        lineUpper.includes('COMPRAS PARCELADAS - PRÓXIMAS FATURAS') ||
        lineUpper.includes('COMPRAS PARCELADAS - PROXIMAS FATURAS') ||
        lineUpper.includes('LIMITES DE CRÉDITO') ||
        lineUpper.includes('LIMITES DE CREDITO') ||
        lineUpper.includes('ENCARGOS COBRADOS NESTA FATURA') ||
        lineUpper.includes('NOVO TETO DE JUROS') ||
        lineUpper.includes('AUTENTICAÇÃO MECÂNICA') ||
        lineUpper.includes('FICHA DE COMPENSAÇÃO')
      ) {
        dentroDoExtrato = false;
      }

      if (!dentroDoExtrato) continue;

      // 3. IGNORA CABEÇALHOS E LINHAS INSTITUCIONAIS
      if (
        lineUpper.includes('PAGAMENTO VIA CONTA') ||
        lineUpper.includes('TOTAL DOS PAGAMENTOS') ||
        lineUpper.includes('TOTAL DOS LANÇAMENTOS ATUAIS') ||
        lineUpper.includes('ESTABELECIMENTO') ||
        lineUpper.includes('PRODUTOS/SERVIÇOS') ||
        lineUpper.includes('VALOR EM R$') ||
        lineUpper.includes('PRINCIPAL (') ||
        lineUpper.includes('JUROS (')
      ) {
        continue;
      }

      // 4. EXTRAÇÃO DA TRANSAÇÃO
      const match = line.match(regexLinhaItau);

      if (match) {
        const data = match[1];
        let desc = match[2].trim();
        const valorStr = match[3];

        // Remove nomes de categorias colados na descricao
        ignorarCategorias.forEach((cat) => {
          const reg = new RegExp(`\\b${cat}\\b`, 'gi');
          desc = desc.replace(reg, '');
        });

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
          if (isNegative) valor = -Math.abs(valor);

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
