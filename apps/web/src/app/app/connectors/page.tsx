import styles from '../command.module.css';

export default function ConnectorsPlaceholderPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Integration Hub</p>
          <h1>Connectors</h1>
          <p className={styles.lede}>Universal Connector Framework — coming in Phase 2.</p>
        </div>
      </header>
      <section className={styles.brief}>
        <div className={styles.panelLabel}>Integration Hub</div>
        <h2>Connect Systems of Record</h2>
        <p>
          REST API, PostgreSQL, CSV, and Email connectors will appear here so Ellines EIP can observe
          your systems without replacing them.
        </p>
      </section>
    </div>
  );
}
