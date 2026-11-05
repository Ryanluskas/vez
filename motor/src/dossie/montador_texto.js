import { comoDinheiro } from "../lista.js";
import { calcularReducaoCapitalCred } from "../lista.js";

/*
  ============================================================================
  MONTADOR DO TEXTO PADRONIZADO — "TEXTO CORRENTISTA SANTANDER"
  Gera o texto oficial pronto para ser enviado ao grupo de pagamento do WhatsApp
  após conferência de todos os documentos e aprovação humana do consultor.
  ============================================================================
*/

export function montarTextoCorrentistaSantander({
  codigoOperacao = "VEZ-2026-000000",
  dados = {},
  contratos = [],
  valorReducao = 0,
  parcelaAtual = 0,
} = {}) {
  const divisao = calcularReducaoCapitalCred(valorReducao);
  const parcelaFormatada = comoDinheiro(parcelaAtual) || "R$ 0,00";

  const linhasContratos = contratos.length > 0
    ? contratos.map((c, i) => `  * Contrato ${i + 1}: ${c.numero} | Parcela: ${c.parcelaFormatada || comoDinheiro(c.parcela)} | Taxa: ${c.taxa || "2,x% a.m."}`).join("\n")
    : "  * Conforme extrato de margem averbado";

  return `*TEXTO CORRENTISTA SANTANDER — CAPITAL CRED*
*OPERAÇÃO:* ${codigoOperacao}

*DADOS PESSOAIS*
NOME: ${dados.nome || "A CONFIRMAR"}
CPF: ${dados.cpf || "A CONFIRMAR"}
DATA NASCIMENTO: ${dados.dataNascimento || "A CONFIRMAR"}
RG: ${dados.rg ? `${dados.rg} ${dados.orgaoEmissor || "SSP"}/${dados.ufRg || "UF"}` : "A CONFIRMAR"}
MÃE: ${dados.mae || "A CONFIRMAR"}
PAI: ${dados.pai || "NÃO CONSTA"}
NATURALIDADE: ${dados.naturalidade ? `${dados.naturalidade}/${dados.ufNaturalidade || ""}` : "A CONFIRMAR"}

*ENDEREÇO*
LOGRADOURO: ${dados.endereco?.logradouro || "CONFORME COMPROVANTE"}
BAIRRO: ${dados.endereco?.bairro || "A CONFIRMAR"}
CIDADE/UF: ${dados.endereco?.cidade ? `${dados.endereco.cidade}/${dados.endereco.uf || ""}` : "A CONFIRMAR"}
CEP: ${dados.endereco?.cep || "A CONFIRMAR"}

*DADOS BANCÁRIOS (SANTANDER)*
BANCO: 033 - BANCO SANTANDER (BRASIL) S.A.
AGÊNCIA: ${dados.bancario?.agencia || "A CONFIRMAR"}
CONTA CORRENTE: ${dados.bancario?.conta || "A CONFIRMAR"}
CHAVE PIX: ${dados.bancario?.pix || dados.cpf || "CPF DO TITULAR"}

*CONDIÇÕES COMERCIAIS REFIN*
TAXA ATUALIZADA: 1,40% a.m.
PRAZO REFIN: 120 meses
PARCELA MENSAL: ${parcelaFormatada} (MANTIDA SEM AUMENTO)
VALOR TOTAL LIBERADO: ${comoDinheiro(divisao.valorTotal)}
REGRA DE DIVISÃO: ${divisao.regra}
- VALOR LÍQUIDO CLIENTE: ${divisao.clienteFormatado} (${divisao.percentualCliente}%)
- REPASSE CONSULTORIA: ${divisao.empresaFormatado} (${divisao.percentualEmpresa}%)

*CONTRATOS VINCULADOS:*
${linhasContratos}
`.trim();
}
