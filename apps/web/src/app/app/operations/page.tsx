'use client';
import Link from 'next/link';
const OPS_MODULES = [
  { href: '/app/operations/sales', label: 'Sales', desc: 'Revenue pipeline and order management.' },
  { href: '/app/operations/purchases', label: 'Purchases', desc: 'Purchase orders and vendor management.' },
  { href: '/app/operations/inventory', label: 'Inventory', desc: 'Stock levels and warehouse management.' },
  { href: '/app/operations/customers', label: 'Customers', desc: 'Customer master data.' },
  { href: '/app/operations/suppliers', label: 'Suppliers', desc: 'Supplier directory.' },
  { href: '/app/operations/payments', label: 'Payments', desc: 'Payments and receivables.' },
  { href: '/app/operations/expenses', label: 'Expenses', desc: 'Expense tracking.' },
  { href: '/app/operations/assets', label: 'Assets', desc: 'Fixed asset register.' },
  { href: '/app/operations/branches', label: 'Branches', desc: 'Branch locations and info.' },
  { href: '/app/operations/warehouses', label: 'Warehouses', desc: 'Warehouse locations.' },
];
export default function OperationsPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem', fontFamily: "'Exo 2', system-ui, sans-serif", color: '#f4f7fb' }}>
      <p style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8b5cf6', margin: '0 0 0.4rem' }}>Operations</p>
      <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.6rem', fontWeight: 800 }}>Operations</h1>
      <p style={{ margin: '0 0 1.5rem', color: '#8b95a8' }}>Operational modules — connect an ERP or CRM to activate live data.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
        {OPS_MODULES.map((m) => (
          <div key={m.href} style={{ background: '#161b26', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.65 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f4f7fb', display: 'flex', alignItems: 'center', gap: 8 }}>
              {m.label}
              <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.07)', color: '#8b95a8', fontWeight: 600 }}>Planned</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#8b95a8', lineHeight: 1.4 }}>{m.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
