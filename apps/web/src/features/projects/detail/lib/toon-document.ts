import type jsPDF from 'jspdf'
import { toonPdfInVenster } from '../../../../services/document-venster'
import { meldFout } from '../../../../utils/fout-melding-toon'

/** Een document in het documentvenster openen, met een melding als dat niet lukt. */
export function toonDocument(actie: string, maak: () => jsPDF, opts: { titel: string; bestandsnaam: string }) {
  try {
    if (!toonPdfInVenster(maak(), opts)) {
      meldFout({
        actie,
        fout: new Error('De browser hield het venster tegen (pop-upblokkering).'),
        gevolg: 'Er is niets geopend. Sta pop-ups toe voor deze app.',
      })
    }
  } catch (fout) {
    meldFout({ actie, fout, gevolg: 'Er is niets geopend en niets gewijzigd.' })
  }
}
