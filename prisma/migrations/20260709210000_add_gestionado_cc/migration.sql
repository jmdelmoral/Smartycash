-- Agrega el estado terminal "GestionadoCC" a las solicitudes de recaudación.
-- El Agente CC lo usa para marcar que ya gestionó el cobro con el cliente final.
ALTER TABLE `CollectionRequest`
  MODIFY `status` ENUM(
    'Pendiente',
    'Preaprobado',
    'Aprobado',
    'Rechazado',
    'Anulado',
    'InformacionSolicitada',
    'GestionadoCC'
  ) NOT NULL DEFAULT 'Pendiente';
