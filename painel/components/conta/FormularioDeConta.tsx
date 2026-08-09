"use client";

import { useActionState } from "react";
import { Botao } from "@/components/ui/Botao";
import { Campo } from "@/components/ui/Campo";
import { Aviso } from "@/components/ui/Aviso";
import type { EstadoDoForm } from "@/lib/acoes";

export function FormularioDeConta({
  acao,
  textoDoBotao,
  trabalhando,
  de,
  dicaDaSenha,
  autoCompleteSenha,
}: {
  acao: (anterior: EstadoDoForm, dados: FormData) => Promise<EstadoDoForm>;
  textoDoBotao: string;
  trabalhando: string;
  de?: string;
  dicaDaSenha?: string;
  autoCompleteSenha: "current-password" | "new-password";
}) {
  const [estado, enviar, pendente] = useActionState(acao, {} as EstadoDoForm);

  return (
    <form action={enviar} className="flex flex-col gap-4">
      {de ? <input type="hidden" name="de" value={de} /> : null}

      <Campo
        rotulo="E-mail"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="voce@exemplo.com.br"
        required
      />
      <Campo
        rotulo="Senha"
        name="senha"
        type="password"
        autoComplete={autoCompleteSenha}
        dica={dicaDaSenha}
        required
      />

      {estado.erro ? <Aviso>{estado.erro}</Aviso> : null}
      {estado.ok ? <Aviso tom="certo">{estado.ok}</Aviso> : null}

      <Botao tom="primario" type="submit" largo disabled={pendente} className="mt-1">
        {pendente ? trabalhando : textoDoBotao}
      </Botao>
    </form>
  );
}
