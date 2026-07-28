import styles from '../command.module.css';

export default function EllineaPlaceholderPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>Ask Ellinea</h1>
        <p>Natural-language enterprise intelligence — coming in Phase 4.</p>
      </header>
      <section className={styles.panel}>
        <div className={styles.panelLabel}>Ellinea AI</div>
        <h2 style={{ margin: '0 0 0.5rem' }}>Conversational intelligence</h2>
        <p className={styles.panelHint}>
          Soon you will ask questions like “How are all my businesses performing today?” and
          Ellinea will answer with explainable insights from your connected systems.
        </p>
      </section>
    </div>
  );
}
