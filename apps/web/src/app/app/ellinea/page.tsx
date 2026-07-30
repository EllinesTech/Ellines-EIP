import styles from '../command.module.css';

export default function EllineaPlaceholderPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Ellinea AI</p>
          <h1>Ask Ellinea</h1>
          <p className={styles.lede}>Natural-language enterprise intelligence — coming in Phase 4.</p>
        </div>
        <img
          src="/brand/ellinea-mark.png"
          alt="Ellinea AI"
          className={styles.ellineaChip}
          style={{ height: 48 }}
        />
      </header>
      <section className={styles.brief}>
        <div className={styles.panelLabel}>Ellinea AI</div>
        <h2>Conversational intelligence</h2>
        <p>
          Soon you will ask questions like “How are all my businesses performing today?” and Ellinea
          will answer with explainable insights from your connected systems.
        </p>
      </section>
    </div>
  );
}
