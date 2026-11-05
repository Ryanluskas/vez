"use client";

import React, { useState, useTransition, useRef, useEffect } from "react";
import {
  MessageSquare,
  Send,
  Phone,
  UserCheck,
  CheckCheck,
  ChevronLeft,
  Bot,
  Info,
  ShieldAlert,
  Sparkles,
  Copy,
  Check,
  ShieldCheck,
  UserX,
  RotateCcw,
  Pause,
  Play,
  Ban,
  Archive,
  Trash2,
  FileText,
  Zap,
  Calculator,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { AppleBadge } from "@/components/ui/apple/AppleBadge";
import { AppleButton } from "@/components/ui/apple/AppleButton";
import { AppleSearchInput } from "@/components/ui/apple/AppleSearchInput";
import { calcularReducaoCapitalCred } from "@/lib/calculadora";
import type { Conversa, Etapa } from "@/lib/tipos";
import type { MensagemItem, FatoMemoria } from "@/lib/dados";
import {
  enviarMensagemManual,
  alternarControleHumano,
  atualizarQualificacaoLead,
  atualizarEtapaComercial,
  registrarOptOut,
  removerOptOut,
  alternarPausaConversa,
  marcarNaoResponder,
  arquivarConversa,
  salvarObservacaoInterna,
  excluirConversaLocal,
} from "@/lib/acoes-painel";

interface CentralAtendimentoProps {
  conversas: Conversa[];
  conversaInicialId?: string | null;
  mensagensIniciais: MensagemItem[];
  fatosIniciais: FatoMemoria[];
}

export function CentralAtendimento({
  conversas,
  conversaInicialId,
  mensagensIniciais,
  fatosIniciais,
}: CentralAtendimentoProps) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "aguardando" | "comigo" | "quentes">("todas");
  const [idSelecionado, setIdSelecionado] = useState<string | null>(
    conversaInicialId || (conversas.length > 0 ? conversas[0].id : null)
  );
  const [mensagens, setMensagens] = useState<MensagemItem[]>(mensagensIniciais);
  const fatos = fatosIniciais;
  const [textoMensagem, setTextoMensagem] = useState("");
  const [painelLateralAberto, setPainelLateralAberto] = useState(true);
  const [copiadoTelefone, setCopiadoTelefone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [observacaoLocal, setObservacaoLocal] = useState("");
  const [salvandoObs, setSalvandoObs] = useState(false);
  const [painelSimuladorAberto, setPainelSimuladorAberto] = useState(false);
  const [valorSimulacaoBruto, setValorSimulacaoBruto] = useState("");

  const conversaAtiva = conversas.find((c) => c.id === idSelecionado) ?? conversas[0];

  const calculoSimulacao = calcularReducaoCapitalCred(valorSimulacaoBruto);
  const primeiroNome = conversaAtiva?.nome ? conversaAtiva.nome.trim().split(/\s+/)[0] : "";
  const propostaCalculada = calculoSimulacao
    ? `${primeiroNome ? `${primeiroNome}, ` : ""}rodei sua simulação aqui no sistema do Santander. Conseguimos liberar ${calculoSimulacao.clienteFormatado} líquido na sua conta hoje, mantendo sua parcela exatamente igual sem subir um centavo! Ficou bom para você? Quer dar entrada?`
    : "";

  function handleEnviarSimulacaoOficial() {
    if (!propostaCalculada || !conversaAtiva) return;
    const textoEnvio = propostaCalculada;
    setValorSimulacaoBruto("");
    setPainelSimuladorAberto(false);

    const novaMsg: MensagemItem = {
      id: "temp-" + Date.now(),
      direcao: "enviada",
      texto: textoEnvio,
      criado_em: new Date().toISOString(),
    };
    setMensagens((prev) => [...prev, novaMsg]);

    startTransition(async () => {
      const fd = new FormData();
      fd.append("id_conversa", conversaAtiva.id);
      fd.append("mensagem", textoEnvio);
      await enviarMensagemManual({ ok: true }, fd);
    });
  }

  useEffect(() => {
    if (conversaAtiva) {
      setObservacaoLocal(conversaAtiva.observacoes || "");
    }
  }, [conversaAtiva?.id, conversaAtiva?.observacoes]);

  function handlePausarRetomarIa(pausar: boolean) {
    if (!conversaAtiva) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id_conversa", conversaAtiva.id);
      fd.append("atender", pausar ? "false" : "true");
      await alternarPausaConversa({ ok: true }, fd);
      conversaAtiva.atender = !pausar;
    });
  }

  function handleNaoResponder() {
    if (!conversaAtiva) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id_conversa", conversaAtiva.id);
      await marcarNaoResponder({ ok: true }, fd);
      conversaAtiva.atender = false;
      conversaAtiva.seguir = false;
    });
  }

  function handleArquivar() {
    if (!conversaAtiva) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id_conversa", conversaAtiva.id);
      await arquivarConversa({ ok: true }, fd);
      conversaAtiva.etapa = "perdido";
      conversaAtiva.atender = false;
    });
  }

  function handleSalvarObs() {
    if (!conversaAtiva) return;
    setSalvandoObs(true);
    startTransition(async () => {
      const fd = new FormData();
      fd.append("id_conversa", conversaAtiva.id);
      fd.append("observacoes", observacaoLocal);
      await salvarObservacaoInterna({ ok: true }, fd);
      conversaAtiva.observacoes = observacaoLocal;
      setSalvandoObs(false);
    });
  }

  function handleExcluirLocal() {
    if (!conversaAtiva) return;
    const ok = window.confirm(
      "Tem certeza que deseja excluir esta conversa do registro interno do Vez?\n\n" +
      "ATENÇÃO: Esta ação remove o histórico apenas no sistema interno Vez. Nenhuma mensagem ou conversa é apagada no WhatsApp."
    );
    if (!ok) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.append("id_conversa", conversaAtiva.id);
      fd.append("confirmacao", "EXCLUIR_LOCAL");
      await excluirConversaLocal({ ok: true }, fd);
      setIdSelecionado(null);
    });
  }

  // Filtros de busca e categoria
  const conversasFiltradas = conversas.filter((c) => {
    const termo = busca.toLowerCase();
    const bateTexto =
      !busca ||
      (c.nome && c.nome.toLowerCase().includes(termo)) ||
      (c.telefone && c.telefone.includes(termo)) ||
      (c.ultima_mensagem && c.ultima_mensagem.toLowerCase().includes(termo));

    if (!bateTexto) return false;

    if (filtro === "aguardando") return c.estagio === "aguardando_voce";
    if (filtro === "comigo") return Boolean(c.so_voce);
    if (filtro === "quentes") return c.qualificacao === "quente";
    return true;
  });

  function selecionarConversa(conversa: Conversa) {
    setIdSelecionado(conversa.id);
    window.history.pushState(null, "", `/conversas?id=${conversa.id}`);
  }

  function handleEnviar(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!textoMensagem.trim() || !conversaAtiva) return;

    const textoEnvio = textoMensagem.trim();
    setTextoMensagem("");

    // Otimista imediato
    const novaMsg: MensagemItem = {
      id: "temp-" + Date.now(),
      direcao: "enviada",
      texto: textoEnvio,
      criado_em: new Date().toISOString(),
    };
    setMensagens((prev) => [...prev, novaMsg]);

    startTransition(async () => {
      const fd = new FormData();
      fd.append("id_conversa", conversaAtiva.id);
      fd.append("mensagem", textoEnvio);
      await enviarMensagemManual({ ok: true }, fd);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  }

  function aplicarAtalhoTexto(texto: string) {
    setTextoMensagem(texto);
    inputRef.current?.focus();
  }

  function handleCopiarTelefone(tel: string) {
    navigator.clipboard?.writeText(tel);
    setCopiadoTelefone(true);
    setTimeout(() => setCopiadoTelefone(false), 2000);
  }

  function handleAlternarControle(assumir: boolean) {
    if (!conversaAtiva) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.append("id_conversa", conversaAtiva.id);
      fd.append("assumir", assumir ? "true" : "false");
      await alternarControleHumano({ ok: true }, fd);
      conversaAtiva.so_voce = assumir;
      conversaAtiva.estagio = assumir ? "aguardando_voce" : "aguardando_bot";
    });
  }

  function handleMudarQualificacao(qualificacao: string) {
    if (!conversaAtiva) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.append("id_conversa", conversaAtiva.id);
      fd.append("qualificacao", qualificacao);
      await atualizarQualificacaoLead({ ok: true }, fd);
      conversaAtiva.qualificacao = qualificacao as Conversa["qualificacao"];
    });
  }

  function handleMudarEtapa(etapa: Etapa) {
    if (!conversaAtiva) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.append("id_conversa", conversaAtiva.id);
      fd.append("etapa", etapa);
      await atualizarEtapaComercial({ ok: true }, fd);
      conversaAtiva.etapa = etapa;
    });
  }

  function handleAlternarOptOut(descadastrar: boolean) {
    if (!conversaAtiva) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.append("id_conversa", conversaAtiva.id);
      if (descadastrar) {
        fd.append("motivo", "solicitado_pelo_consultor");
        await registrarOptOut({ ok: true }, fd);
        conversaAtiva.opt_out = true;
        conversaAtiva.atender = false;
        conversaAtiva.etapa = "perdido";
      } else {
        await removerOptOut({ ok: true }, fd);
        conversaAtiva.opt_out = false;
        conversaAtiva.atender = true;
        conversaAtiva.etapa = "primeiro_atendimento";
      }
    });
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-fundo select-none">
      {/* 1. Coluna Esquerda: Lista de Conversas Apple-Style */}
      <div
        className={cn(
          "w-full md:w-[320px] lg:w-[360px] shrink-0 border-r border-fio flex flex-col bg-sup/40 backdrop-blur-xl",
          idSelecionado ? "hidden md:flex" : "flex"
        )}
      >
        <div className="p-4 border-b border-fio space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-[20px] font-bold tracking-tight text-texto">
              Atendimento
            </h1>
            <span className="text-[12px] font-mono text-texto3 num">
              {conversasFiltradas.length} ativas
            </span>
          </div>

          <AppleSearchInput
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente, telefone..."
            onClear={() => setBusca("")}
          />

          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: "todas", label: "Todas" },
              { id: "aguardando", label: "Aguardando" },
              { id: "comigo", label: "Comigo" },
              { id: "quentes", label: "Quentes 🔥" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id as "todas" | "aguardando" | "comigo" | "quentes")}
                className={cn(
                  "px-3 py-1 rounded-xl text-[12px] font-medium whitespace-nowrap transition-all cursor-pointer",
                  filtro === f.id
                    ? "bg-sup text-texto shadow-sm border border-fio"
                    : "text-texto3 hover:text-texto hover:bg-sup2"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-fio/40">
          {conversasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-texto3 text-[13px]">
              Nenhuma conversa encontrada com os filtros atuais.
            </div>
          ) : (
            conversasFiltradas.map((conversa) => {
              const selecionada = conversa.id === idSelecionado;
              const nomeOuNumero = conversa.nome || conversa.telefone;
              const inicial = (nomeOuNumero[0] || "?").toUpperCase();

              return (
                <div
                  key={conversa.id}
                  onClick={() => selecionarConversa(conversa)}
                  className={cn(
                    "flex items-start gap-3 p-3.5 transition-colors cursor-pointer select-none",
                    selecionada
                      ? "bg-sup border-l-2 border-jade"
                      : "hover:bg-sup2/60"
                  )}
                >
                  <div
                    className={cn(
                      "h-11 w-11 rounded-2xl flex items-center justify-center font-display font-semibold text-[14px] shrink-0 border border-fio",
                      conversa.qualificacao === "quente"
                        ? "bg-erro-fundo text-erro border-erro/30"
                        : "bg-sup2 text-texto"
                    )}
                  >
                    {inicial}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-display text-[14px] font-semibold text-texto truncate">
                        {nomeOuNumero}
                      </span>
                      <span className="text-[11px] font-mono text-texto3 shrink-0 num">
                        {new Date(conversa.atualizado_em).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    <p className="text-[12px] text-texto2 truncate leading-relaxed">
                      {conversa.ultima_mensagem || "Conversa iniciada"}
                    </p>

                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {conversa.so_voce ? (
                        <AppleBadge variant="info">Com Você</AppleBadge>
                      ) : conversa.estagio === "aguardando_voce" ? (
                        <AppleBadge variant="warning" dot>
                          Aguardando
                        </AppleBadge>
                      ) : (
                        <AppleBadge variant="success" dot>
                          Vez Ativo
                        </AppleBadge>
                      )}

                      {conversa.qualificacao === "quente" && (
                        <span className="text-[11px] font-medium text-amber-500">🔥 Quente</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Coluna Central: Thread do Atendimento ao Vivo */}
      <div
        className={cn(
          "flex-1 flex flex-col bg-fundo overflow-hidden",
          !idSelecionado ? "hidden md:flex" : "flex"
        )}
      >
        {conversaAtiva ? (
          <>
            {/* Top Bar da Conversa */}
            <div className="h-16 border-b border-fio px-4 sm:px-6 flex items-center justify-between bg-sup/60 backdrop-blur-md shrink-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIdSelecionado(null)}
                  className="md:hidden p-2 -ml-2 rounded-xl text-texto2 hover:text-texto cursor-pointer"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>

                <div className="h-10 w-10 rounded-2xl bg-sup2 border border-fio flex items-center justify-center font-bold text-texto shrink-0">
                  {(conversaAtiva.nome?.[0] || conversaAtiva.telefone[0] || "?").toUpperCase()}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-[15px] font-semibold text-texto tracking-tight">
                      {conversaAtiva.nome || conversaAtiva.telefone}
                    </h2>
                    {conversaAtiva.opt_out ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                        Opt-Out Ativo
                      </span>
                    ) : conversaAtiva.so_voce ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        Atendimento Humano
                      </span>
                    ) : !conversaAtiva.atender ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">
                        IA Pausada
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        IA Ativa
                      </span>
                    )}

                    {(conversaAtiva.origem_contato === "prospeccao" ||
                      conversaAtiva.origem === "prospeccao") && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                        <Zap className="h-2.5 w-2.5" /> Botzapzap
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] text-texto3 font-mono flex items-center gap-1 num">
                      <Phone className="h-3 w-3" />
                      {conversaAtiva.telefone}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCopiarTelefone(conversaAtiva.telefone)}
                      title="Copiar telefone"
                      className="text-texto3 hover:text-texto transition-colors cursor-pointer"
                    >
                      {copiadoTelefone ? (
                        <Check className="h-3 w-3 text-jade" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {conversaAtiva.so_voce ? (
                  <AppleButton
                    size="sm"
                    variant="glass"
                    onClick={() => handleAlternarControle(false)}
                    icon={<Bot className="h-3.5 w-3.5 text-jade" />}
                  >
                    Devolver ao Vez
                  </AppleButton>
                ) : (
                  <AppleButton
                    size="sm"
                    variant="secondary"
                    onClick={() => handleAlternarControle(true)}
                    icon={<UserCheck className="h-3.5 w-3.5 text-amber-500" />}
                  >
                    Assumir Chat
                  </AppleButton>
                )}

                <button
                  type="button"
                  onClick={() => setPainelLateralAberto(!painelLateralAberto)}
                  className={cn(
                    "p-2 rounded-xl border border-fio transition-colors hidden lg:flex cursor-pointer",
                    painelLateralAberto ? "bg-sup text-texto" : "bg-sup2 text-texto3 hover:text-texto"
                  )}
                  title="Dossiê do Cliente"
                >
                  <Info className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Lista de Mensagens com Balões Fluidos */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 bg-gradient-to-b from-fundo to-sup/10">
              {mensagens.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-texto3 space-y-2">
                  <MessageSquare className="h-8 w-8 stroke-[1.5]" />
                  <p className="text-[13px]">Início da conversa com este cliente.</p>
                </div>
              ) : (
                mensagens.map((msg) => {
                  const enviada = msg.direcao === "enviada";

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex flex-col max-w-[85%] sm:max-w-[70%]",
                        enviada ? "ml-auto items-end" : "mr-auto items-start"
                      )}
                    >
                      <div
                        className={cn(
                          "px-4 py-2.5 text-[14px] leading-relaxed break-words shadow-sm",
                          enviada
                            ? "bg-emerald-600 text-white rounded-2xl rounded-br-sm"
                            : "bg-sup border border-fio text-texto rounded-2xl rounded-bl-sm"
                        )}
                      >
                        {msg.texto}
                      </div>

                      <div className="flex items-center gap-1 mt-1 px-1 text-[10px] font-mono text-texto3">
                        <span className="num">
                          {new Date(msg.criado_em).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {enviada && <CheckCheck className="h-3 w-3 text-jade" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Simulador Proativo CapitalCred: Quando aguardando você ou quando acionado pelo operador */}
            {(painelSimuladorAberto || conversaAtiva.estagio === "aguardando_voce") && (
              <div className="p-3.5 border-t border-jade/30 bg-jade-fundo/40 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-lg bg-jade/20 text-jade flex items-center justify-center">
                      <Calculator className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <span className="text-[12px] font-semibold text-texto">
                        Simulação Santander {primeiroNome ? `· ${primeiroNome}` : ""}
                      </span>
                      <p className="text-[11px] text-texto2">
                        Quanto libera no total no sistema? (Calculamos a proposta oficial ao cliente)
                      </p>
                    </div>
                  </div>
                  {conversaAtiva.estagio !== "aguardando_voce" && (
                    <button
                      type="button"
                      onClick={() => setPainelSimuladorAberto(false)}
                      className="text-[11px] text-texto3 hover:text-texto cursor-pointer"
                    >
                      Fechar
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] font-mono text-texto3">
                      R$
                    </span>
                    <input
                      type="text"
                      value={valorSimulacaoBruto}
                      onChange={(e) => setValorSimulacaoBruto(e.target.value)}
                      placeholder="Ex: 7600 (valor total liberado no sistema)"
                      className="w-full h-9 pl-9 pr-3 rounded-xl bg-sup border border-fio text-[13px] text-texto placeholder:text-texto3 focus:outline-none focus:border-jade font-mono"
                    />
                  </div>

                  {calculoSimulacao?.valido && (
                    <AppleButton
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleEnviarSimulacaoOficial}
                      icon={<Send className="h-3.5 w-3.5" />}
                      className="shrink-0"
                    >
                      Enviar Proposta ({calculoSimulacao.clienteFormatado} líquido)
                    </AppleButton>
                  )}
                </div>

                {calculoSimulacao?.valido && (
                  <div className="p-2.5 rounded-xl bg-sup border border-fio/60 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-texto3 block text-[10px]">Total no Sistema</span>
                        <strong className="text-texto font-mono">{calculoSimulacao.totalFormatado}</strong>
                      </div>
                      <div className="h-4 w-px bg-fio" />
                      <div>
                        <span className="text-jade font-medium block text-[10px]">Liberado ao Cliente</span>
                        <strong className="text-jade font-mono text-[12px]">{calculoSimulacao.clienteFormatado}</strong>
                      </div>
                      <div className="h-4 w-px bg-fio" />
                      <div>
                        <span className="text-texto3 block text-[10px]">Margem CapitalCred ({calculoSimulacao.regra})</span>
                        <strong className="text-texto2 font-mono">{calculoSimulacao.empresaFormatado}</strong>
                      </div>
                    </div>
                    <span className="text-[10px] text-texto3 italic">
                      Taxa 1,40% · Parcela inalterada
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Barra de Atalhos Rápidos para Consignado */}
            <div className="px-4 py-2 border-t border-fio bg-sup/40 backdrop-blur-md flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              <span className="text-[10px] font-mono uppercase text-texto3 shrink-0 flex items-center gap-1 mr-1">
                <Sparkles className="h-3 w-3 text-jade" />
                Atalhos:
              </span>
              <button
                type="button"
                onClick={() => setPainelSimuladorAberto((prev) => !prev)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] border transition-all shrink-0 cursor-pointer flex items-center gap-1",
                  painelSimuladorAberto
                    ? "bg-jade/20 border-jade/40 text-jade font-medium"
                    : "bg-sup2 hover:bg-sup text-texto2 hover:text-texto border-fio"
                )}
              >
                <Calculator className="h-3 w-3" />
                Simular Santander (62/38 ou 50/50)
              </button>
              <button
                type="button"
                onClick={() =>
                  aplicarAtalhoTexto(
                    "Para formalizar a liberação no Santander com segurança e emitir seu contrato digital, vou precisar desta documentação:\n\n• Documento oficial com foto (RG ou CNH frente e verso)\n• Comprovante de endereço atualizado\n• Contracheque atualizado / Holerite\n• Extrato de margem consignável\n• Número(s) do(s) contrato(s) do Santander que vamos refinanciar\n\nVocê prefere me mandar por aqui agora ou te chamo mais tarde para você tirar com calma?"
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-sup2 hover:bg-sup text-[11px] text-texto2 hover:text-texto border border-fio transition-all shrink-0 cursor-pointer"
              >
                📄 Solicitar Checklist 5 Documentos
              </button>
              <button
                type="button"
                onClick={() =>
                  aplicarAtalhoTexto(
                    "Isso mesmo! Com esses 5 documentos na mão a gente confere tudo e dá entrada na sua liberação no Santander com total segurança."
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-sup2 hover:bg-sup text-[11px] text-texto2 hover:text-texto border border-fio transition-all shrink-0 cursor-pointer"
              >
                ✅ Confirmar "Só isso mesmo?"
              </button>
              <button
                type="button"
                onClick={() =>
                  aplicarAtalhoTexto(
                    "Olá! Consigo simular as melhores opções de crédito consignado para você. Qual o seu benefício ou órgão pagador?"
                  )
                }
                className="px-2.5 py-1 rounded-lg bg-sup2 hover:bg-sup text-[11px] text-texto2 hover:text-texto border border-fio transition-all shrink-0 cursor-pointer"
              >
                👋 Saudação Inicial
              </button>
            </div>

            {/* Input de Envio de Mensagem */}
            <form
              onSubmit={handleEnviar}
              className="p-3 sm:p-4 border-t border-fio bg-sup/60 backdrop-blur-md shrink-0 flex items-center gap-2.5"
            >
              <input
                ref={inputRef}
                type="text"
                value={textoMensagem}
                onChange={(e) => setTextoMensagem(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  conversaAtiva.so_voce
                    ? "Você está no controle humano. Digite sua mensagem (Enter para enviar)..."
                    : "Digite para assumir o controle e responder ao cliente..."
                }
                className="flex-1 h-11 px-4 rounded-2xl bg-sup2 border border-fio text-[13.5px] text-texto placeholder:text-texto3 focus:outline-none focus:border-jade focus:bg-sup transition-all"
              />

              <AppleButton
                type="submit"
                variant="primary"
                size="md"
                disabled={!textoMensagem.trim() || isPending}
                icon={<Send className="h-4 w-4" />}
              >
                Enviar
              </AppleButton>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-texto3">
            <MessageSquare className="h-10 w-10 stroke-[1.5] mb-2" />
            <p className="text-[14px] text-texto font-medium">Selecione uma conversa</p>
            <p className="text-[12px] text-texto3 mt-1 max-w-xs">
              Escolha um contato à esquerda para acompanhar ou intervir no atendimento.
            </p>
          </div>
        )}
      </div>

      {/* 3. Coluna Direita: Dossiê do Cliente e Copiloto Comercial */}
      {conversaAtiva && painelLateralAberto && (
        <div className="hidden lg:flex w-[320px] shrink-0 border-l border-fio flex-col bg-sup/30 backdrop-blur-md p-5 space-y-6 overflow-y-auto">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-jade font-semibold">
              Copiloto Comercial
            </span>
            <h3 className="font-display text-[16px] font-bold text-texto tracking-tight mt-0.5">
              Dossiê do Cliente
            </h3>
          </div>

          {/* Etapa Comercial (8 Estágios CapitalCred) */}
          <div className="space-y-2">
            <label className="text-[12px] font-medium text-texto2 flex items-center justify-between">
              <span>Etapa no Funil:</span>
              <span className="text-[11px] font-mono text-texto3 capitalize">
                {(conversaAtiva.etapa || "novo_contato").replace(/_/g, " ")}
              </span>
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: "novo_contato", label: "1. Novo" },
                { id: "primeiro_atendimento", label: "2. 1º Atend." },
                { id: "em_qualificacao", label: "3. Qualificando" },
                { id: "qualificado", label: "4. Qualificado" },
                { id: "aguardando_consultor", label: "5. P/ Consultor" },
                { id: "em_negociacao", label: "6. Negociação" },
                { id: "convertido", label: "7. Convertido" },
                { id: "perdido", label: "8. Perdido" },
              ].map((etp) => (
                <button
                  key={etp.id}
                  type="button"
                  onClick={() => handleMudarEtapa(etp.id as Etapa)}
                  className={cn(
                    "p-1.5 rounded-xl text-[11px] font-medium border text-center transition-all cursor-pointer",
                    conversaAtiva.etapa === etp.id
                      ? "bg-sup text-texto border-jade font-semibold shadow-sm"
                      : "bg-sup2 text-texto2 border-fio hover:border-fio-forte"
                  )}
                >
                  {etp.label}
                </button>
              ))}
            </div>
          </div>

          {/* Temperatura SPIN Selling */}
          <div className="space-y-2">
            <label className="text-[12px] font-medium text-texto2">
              Qualificação Comercial (SPIN):
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: "quente", label: "Quente 🔥", color: "hover:border-erro/40" },
                { id: "morna", label: "Morna ⚡", color: "hover:border-amber-500/40" },
                { id: "fria", label: "Fria ❄️", color: "hover:border-azul/40" },
                { id: "desqualificada", label: "Desqualif. ❌", color: "hover:border-fio" },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleMudarQualificacao(t.id)}
                  className={cn(
                    "p-2 rounded-xl text-[12px] font-medium border text-center transition-all cursor-pointer",
                    conversaAtiva.qualificacao === t.id
                      ? "bg-sup text-texto border-jade font-semibold shadow-sm"
                      : "bg-sup2 text-texto2 border-fio",
                    t.color
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conformidade LGPD & Gestão de Opt-Out */}
          <div className="p-3.5 rounded-2xl bg-sup2/50 border border-fio space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold text-texto flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-jade" />
                Privacidade & LGPD
              </span>
              {conversaAtiva.opt_out ? (
                <AppleBadge variant="destructive">Opt-Out Ativo</AppleBadge>
              ) : (
                <AppleBadge variant="success">Consentimento Ativo</AppleBadge>
              )}
            </div>
            <p className="text-[11px] text-texto3 leading-relaxed">
              {conversaAtiva.opt_out
                ? "Cliente solicitou descadastramento. O bot nunca envia mensagens automáticas para este número."
                : "Cliente elegível para abordagens e follow-ups comerciais supervisionados."}
            </p>
            {conversaAtiva.opt_out ? (
              <AppleButton
                size="sm"
                variant="secondary"
                className="w-full text-[12px]"
                icon={<RotateCcw className="h-3.5 w-3.5" />}
                onClick={() => handleAlternarOptOut(false)}
              >
                Reativar Contato
              </AppleButton>
            ) : (
              <AppleButton
                size="sm"
                variant="destructive"
                className="w-full text-[12px]"
                icon={<UserX className="h-3.5 w-3.5" />}
                onClick={() => handleAlternarOptOut(true)}
              >
                Descadastrar (Opt-Out)
              </AppleButton>
            )}
          </div>

          {/* Ações Rápidas de Governança */}
          <div className="p-3.5 rounded-2xl bg-sup2/50 border border-fio space-y-2.5">
            <span className="text-[12px] font-semibold text-texto flex items-center gap-1.5">
              <Bot className="h-4 w-4 text-jade" />
              Controles do Atendente
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {conversaAtiva.atender ? (
                <AppleButton
                  size="sm"
                  variant="secondary"
                  className="text-[11px]"
                  icon={<Pause className="h-3 w-3 text-amber-500" />}
                  onClick={() => handlePausarRetomarIa(true)}
                >
                  Pausar IA
                </AppleButton>
              ) : (
                <AppleButton
                  size="sm"
                  variant="glass"
                  className="text-[11px]"
                  icon={<Play className="h-3 w-3 text-jade" />}
                  onClick={() => handlePausarRetomarIa(false)}
                >
                  Retomar IA
                </AppleButton>
              )}

              <AppleButton
                size="sm"
                variant="secondary"
                className="text-[11px]"
                icon={<Ban className="h-3 w-3 text-texto3" />}
                onClick={handleNaoResponder}
              >
                Não Responder
              </AppleButton>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <AppleButton
                size="sm"
                variant="secondary"
                className="text-[11px]"
                icon={<Archive className="h-3 w-3 text-texto3" />}
                onClick={handleArquivar}
              >
                Arquivar
              </AppleButton>

              <AppleButton
                size="sm"
                variant="destructive"
                className="text-[11px]"
                icon={<Trash2 className="h-3 w-3 text-red-400" />}
                onClick={handleExcluirLocal}
                title="Exclui apenas do histórico local do Vez. Não apaga conversas no WhatsApp."
              >
                Excluir Local
              </AppleButton>
            </div>
          </div>

          {/* Observações Internas */}
          <div className="p-3.5 rounded-2xl bg-sup2/50 border border-fio space-y-2">
            <span className="text-[12px] font-semibold text-texto flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-texto2" />
              Observações Internas
            </span>
            <textarea
              value={observacaoLocal}
              onChange={(e) => setObservacaoLocal(e.target.value)}
              placeholder="Anotações privadas para a equipe..."
              rows={2}
              className="w-full text-[12px] bg-sup rounded-xl border border-fio p-2 text-texto focus:border-jade outline-none resize-none"
            />
            <AppleButton
              size="sm"
              variant="secondary"
              className="w-full text-[11px]"
              onClick={handleSalvarObs}
            >
              {salvandoObs ? "Salvando..." : "Salvar Anotação"}
            </AppleButton>
          </div>

          {/* Dados e Fatos Extraídos */}
          <div className="space-y-2">
            <label className="text-[12px] font-medium text-texto2 flex items-center justify-between">
              <span>Dados Consignado Extraídos:</span>
              <span className="text-[11px] font-mono text-texto3">{fatos.length} itens</span>
            </label>
            <div className="space-y-2">
              {fatos.length === 0 ? (
                <div className="p-3 rounded-2xl bg-sup2/50 border border-fio text-[12px] text-texto3">
                  Nenhum dado formal (convênio, margem ou banco) consolidado ainda nesta conversa.
                </div>
              ) : (
                fatos.map((fato, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-sup2 border border-fio text-[12px]"
                  >
                    <span className="font-medium text-texto capitalize">
                      {fato.chave.replace(/_/g, " ")}:
                    </span>
                    <span className="font-mono text-jade font-semibold num">
                      {fato.valor}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Garantias Financeiras CapitalCred */}
          <div className="p-3.5 rounded-2xl bg-sup2/40 border border-fio space-y-2 text-[12px]">
            <span className="font-semibold text-texto flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-jade" />
              Barreiras CapitalCred
            </span>
            <p className="text-[11px] text-texto3 leading-relaxed">
              O motor protege a operação: a IA nunca inventa valores de parcelas ou taxas. Todas as propostas finais exigem sua validação na Fila de Triage.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
