
/*
PATCH TEMPORANEA:
Cancella il punteggio del nickname "Tierrenne" UNA SOLA VOLTA all'avvio.
Non modifica il resto del sito.
*/

async function deleteTierrenneScore(pool) {
  try {
    await pool.query(`
      DELETE FROM pdt_jump_scores
      WHERE LOWER(TRIM(nickname)) = LOWER(TRIM('Tierrenne'))
    `);
    console.log("Punteggio Tierrenne cancellato");
  } catch (err) {
    console.error("Errore cancellazione Tierrenne:", err.message);
  }
}

module.exports = { deleteTierrenneScore };
