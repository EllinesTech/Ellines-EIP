import styles from '../command.module.css';

export default function ConnectorsPlaceholderPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Connectors</h1>
        <p>Universal Connector Framework — coming in Phase 2.</p>
      </header>
      <section className={styles.panel}>
        <div className={styles.panelLabel}>Integration Hub</div>
        <h2 style={{ margin: '0 0 0.5rem' }}>Connect Systems of Record</h2>
        <p className={styles.panelHint}>
          REST API, PostgreSQL, CSV, and Email connectors will appear here so Ellines EIP can
          observe your systems without replacing them.
        </p>
      </section>
    </div>
  );
}
