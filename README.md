# La campaña · España en juego

[**Jugar a La campaña**](https://elcontemplador.github.io/la-campana/)

**Reglas 0.8.5 · presentación guía2 · demo para probar con personas.** Crea tu candidatura,
disputa provincias durante diez turnos y convierte tus escaños en una investidura.
Partidos y personajes ficticios; 52 circunscripciones y 350 escaños.

Para tu primera partida, elige **Partida personalizada → Campaña abierta →
Iniciación**. Elige tu partido, candidato y equipo; la guía se puede saltar.
**Visitar, Medios, Recaudar y Descansar** preparan una jugada; **Jugar** la ejecuta
junto con las tareas del equipo. Las noticias y el debate tienen decisiones propias.

## Ayuda en dos niveles

**Básico** explica las cuatro jugadas, caja y energía. **Avanzado** detalla las
siete tareas del equipo, preparación, cohesión, reputación, sondeos y pactos.
Ambos están en Cómo jugar y en la guía durante la partida. Pulsa el nombre
de un recurso para ver su explicación. Cambiar de nivel no ejecuta decisiones.

Responde a una noticia para aplicar sus efectos; elegir jugada o tareas solo
prepara la agenda, que ejecutas con Jugar. Reglas y guardados se conservan.

## Probar localmente

Python 3.10 o posterior; sin instalar paquetes:

```sh
python scripts/serve.py
```

Abre <http://127.0.0.1:8765/>. No abras el HTML directamente. El servidor expone
solo `app/` y escucha únicamente en tu equipo. Para otro puerto:
`python scripts/serve.py --port 8766`.

La partida se guarda en ese navegador. Exporta el JSON desde el juego para
conservarla. Cambiar del servidor local a GitHub Pages cambia el origen del
navegador: importa el archivo para continuar; no se transfieren guardados solos.
Las nueve ediciones reconocidas mantienen sus reglas al continuar o repetir.
Una **partida nueva** usa la edición actual. No hay cuentas ni analítica remota.

## Publicar este repositorio aislado en GitHub Pages

1. Crea un repositorio nuevo, con rama `main`, y sube **el contenido de esta
   carpeta**, incluyendo `.github/`. No subas la carpeta de trabajo original.
2. En **Settings → Pages → Build and deployment**, selecciona **GitHub Actions**.
3. Ejecuta **Publicar juego en Pages** desde **Actions**, o sube un commit a `main`.
4. El workflow valida archivos y ejecuta las suites incluidas; publica
   exclusivamente `app/`. Usa la dirección que devuelve el job de despliegue.

Las rutas son relativas, compatibles con la subcarpeta de un proyecto de Pages.
No hacen falta un backend, Python en producción, API, claves ni variables secretas.
El workflow comprueba cada actualización antes del despliegue.
En un repositorio privado, la disponibilidad de Pages depende del plan de GitHub.
La publicación y visibilidad del repositorio las decide Fernando.

## Comprobar el paquete

Python 3.10+ y Node.js 24+, sin dependencias externas:

```sh
python scripts/verify_release.py
node --test --test-isolation=none tests/*.test.mjs
```

El verificador revisa el manifiesto SHA-256, módulos, archivos públicos, enlaces
locales y coincidencia entre datos canónicos y públicos. Las suites son una
selección autocontenida: reparto/investidura, campaña, guardado/replay, creación,
noticias preparadas, debate, previsiones y pérdida de novedad de Medios. No son
la suite completa del desarrollo. Los escenarios de prueba son sintéticos; no
se incluyen partidas privadas ni archivos de observación humana.

El [manifiesto](RELEASE_MANIFEST.json) identifica todos los contenidos. El ZIP
se genera con orden, fecha y permisos fijos; una misma entrada produce el mismo ZIP.
Para futuras modificaciones revisa el manifiesto y vuelve a construir la entrega
desde las fuentes; el verificador detectará cambios respecto a esta entrega.

## Primera prueba humana

La [ficha de prueba](docs/PRIMERA_PRUEBA.md) permite anotar lo que entiendes,
lo que te hace decidir y las ganas de repetir. No hay formulario ni envío automático.
Nadie ha sido contactado durante la preparación. Las pruebas técnicas no prueban
que el juego sea divertido: ese es el propósito de esta entrega.

## Créditos y derechos

Concepto impulsado por Fernando Nieto Lobato; título y marca provisionales.
Los [créditos del juego](app/credits.html) conservan fuentes institucionales,
inspiración y atribuciones. Cartografía adaptada: © Instituto Geográfico Nacional
de España, CC BY 4.0; países vecinos de Natural Earth, dominio público.

No se ha elegido ni añadido una licencia de software. Publicar un repositorio
no concede por sí mismo una licencia general de reutilización del código,
personajes o textos. La atribución cartográfica tiene sus propias condiciones.

[Documentación oficial del workflow Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
· [setup-node](https://github.com/actions/setup-node).
