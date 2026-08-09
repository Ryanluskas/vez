import { redirect } from "next/navigation";

/* A raiz nao tem tela propria: o produto comeca na Fila.
   Quem nao esta logado e desviado pro /entrar no proxy.ts. */
export default function Raiz() {
  redirect("/fila");
}
