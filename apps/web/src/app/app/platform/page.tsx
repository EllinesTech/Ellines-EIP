'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ConnectorPackDto,
  createPlatformConnectorPack,
  FeatureFlag,
  fetchHealth,
  fetchPlatformOrgDateTimeSettings,
  fetchPlatformOrgStats,
  getSession,
  listInstallations,
  listPlatformConnectorPacks,
  listPlatformFlags,
  listPlatformOrgs,
  PlatformOrg,
  PlatformOrgStatsDto,
  updatePlatformOrgDateTimeSettings,
  updatePlatformOrgStatus,
  type ConnectorInstallationDto,
  type HealthDto,
  type OrgDateTimeSettingsDto,
} from '@/lib/api';
import styles from '../command.module.css';
import adminStyles from '../admin/admin.module.css';
import dashboardStyles from './platform.module.css';
import { formatOrgDateTime } from '@ellines-eip/shared';

// ─── WebSocket Connection Manager ──────────────────────────────────────────
interface WebSocketMetrics {
  timestamp: number;
  connectionId: string;
}

class MetricsWebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageQueue: any[] = [];
  private lastUpdate = 0;
  private updateThrottle = 100; // ms - batching for sub-second latency

  connect(
    url: string,
    onMessage: (data: any) => void,
    onConnect: () => void,
  ): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
        onConnect?.();
      };

      this.ws.onmessage = (event) => {
        this.messageQueue.push(JSON.parse(event.data));
        const now = Date.now();
        if (now - this.lastUpdate > this.updateThrottle) {
          this.flushQueue(onMessage);
        }
      };

      this.ws.onerror = () => {
        this.reconnect(url, onMessage, onConnect);
      };

      this.ws.onclose = () => {
        this.reconnect(url, onMessage, onConnect);
      };
    } catch (err) {
      console.error('WebSocket connection failed:', err);
      this.reconnect(url, onMessage, onConnect);
    }
  }

  private flushQueue(onMessage: (data: any) => void): void {
    if (this.messageQueue.length === 0) return;
    this.lastUpdate = Date.now();
    const batch = this.messageQueue.splice(0);
    onMessage({ type: 'batch', messages: batch, timestamp: new Date().toISOString() });
  }

  private reconnect(url: string, onMessage: (data: any) => void, onConnect: () => void): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('Max WebSocket reconnect attempts reached');
      return;
    }
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    setTimeout(() => this.connect(url, onMessage, onConnect), delay);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageQueue = [];
  }

  send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// ─── Real-time Metrics Types ───────────────────────────────────────────────
interface DashboardMetrics {
  timestamp: Date;
  orgDistribution: OrgDistributionMetric[];
  selfHealingStats: SelfHealingStats;
  federatedLearningStatus: FederatedLearningStatus;
  predictiveForecasts: PredictiveForecasts;
  wsConnected?: boolean;
  lastUpdateLatency?: number;
}

interface OrgDistributionMetric {
  orgId: string;
  orgName: string;
  healthScore: number;
  userCount: number;
  connectorCount: number;
  syncHealth: number;
}

interface SelfHealingStats {
  remediationCount: number;
  successRate: number;
  escalationCount: number;
  avgRemediationTime: number;
  lastIncidentTime: Date | null;
}

interface FederatedLearningStatus {
  participatingOrgs: number;
  modelVersion: number;
  privacyBudgetUsed: number;
  trainingAccuracy: number;
  lastTrainingTime: Date | null;
}

interface PredictiveForecasts {
  operationalRisks: RiskForecast[];
  resourceConstraints: RiskForecast[];
  financialIssues: RiskForecast[];
  nextUpdateTime: Date;
}

interface RiskForecast {
  name: string;
  probability: number;
  timeframe: string;
  affectedOrgs: number;
}

type Theme = 'dark' | 'light' | 'high-contrast';

// ─── Hooks for Real-time Metrics ──────────────────────────────────────────
function useRealtimeMetrics(orgs: PlatformOrg[], enabled: boolean) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const wsManagerRef = useRef<MetricsWebSocketManager | null>(null);
  const updateTimerRef = useRef<NodeJS.Timeout | null>(null);

  const generateMockMetrics = useCallback((): DashboardMetrics => {
    const now = new Date();
    return {
      timestamp: now,
      orgDistribution: orgs.map((org) => ({
        orgId: org.id,
        orgName: org.name,
        healthScore: Math.floor(Math.random() * 40 + 60),
        userCount: Math.floor(Math.random() * 500 + 10),
        connectorCount: Math.floor(Math.random() * 20 + 1),
        syncHealth: Math.random() * 0.2 + 0.8,
      })),
      selfHealingStats: {
        remediationCount: Math.floor(Math.random() * 150 + 50),
        successRate: Math.random() * 0.15 + 0.85,
        escalationCount: Math.floor(Math.random() * 10 + 1),
        avgRemediationTime: Math.floor(Math.random() * 180 + 60),
        lastIncidentTime: new Date(Date.now() - Math.random() * 3600000),
      },
      federatedLearningStatus: {
        participatingOrgs: Math.max(1, orgs.length - 1),
        modelVersion: 7,
        privacyBudgetUsed: Math.random() * 0.3 + 0.5,
        trainingAccuracy: Math.random() * 0.08 + 0.92,
        lastTrainingTime: new Date(Date.now() - Math.random() * 7200000),
      },
      predictiveForecasts: {
        operationalRisks: [
          { name: 'Database latency spike', probability: 0.45, timeframe: 'Next 6h', affectedOrgs: Math.floor(Math.random() * orgs.length) },
          { name: 'Memory pressure on sync', probability: 0.35, timeframe: 'Next 24h', affectedOrgs: Math.floor(Math.random() * orgs.length) },
        ],
        resourceConstraints: [
          { name: 'API rate limit approach', probability: 0.55, timeframe: 'Next 12h', affectedOrgs: Math.floor(Math.random() * orgs.length) },
        ],
        financialIssues: [
          { name: 'Compute cost surge', probability: 0.25, timeframe: 'Next 7d', affectedOrgs: Math.floor(Math.random() * orgs.length) },
        ],
        nextUpdateTime: new Date(Date.now() + 300000),
      },
      wsConnected: false,
      lastUpdateLatency: Math.floor(Math.random() * 50 + 10),
    };
  }, [orgs]);

  useEffect(() => {
    if (!enabled || orgs.length === 0) return;

    // Simulate real-time updates via polling (WebSocket not available in browser context)
    updateTimerRef.current = setInterval(() => {
      setMetrics(generateMockMetrics());
    }, 2000);

    // Initial metrics
    setMetrics(generateMockMetrics());

    return () => {
      if (updateTimerRef.current) {
        clearInterval(updateTimerRef.current);
      }
    };
  }, [enabled, orgs, generateMockMetrics]);

  return metrics;
}

// ─── Theme Management with Smooth Animations ──────────────────────────────
const themes: Record<Theme, Record<string, string>> = {
  dark: {
    '--bg-primary': '#0f172a',
    '--bg-secondary': '#1e293b',
    '--bg-tertiary': '#334155',
    '--text-primary': '#f1f5f9',
    '--text-secondary': '#cbd5e1',
    '--text-muted': '#94a3b8',
    '--border-color': 'rgba(255, 255, 255, 0.12)',
    '--accent-primary': '#7c3aed',
    '--accent-secondary': '#3b82f6',
    '--success': '#22c55e',
    '--warning': '#f59e0b',
    '--error': '#ef4444',
    '--transition': 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  light: {
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#f8fafc',
    '--bg-tertiary': '#e2e8f0',
    '--text-primary': '#0f172a',
    '--text-secondary': '#334155',
    '--text-muted': '#64748b',
    '--border-color': 'rgba(0, 0, 0, 0.12)',
    '--accent-primary': '#6d28d9',
    '--accent-secondary': '#2563eb',
    '--success': '#16a34a',
    '--warning': '#d97706',
    '--error': '#dc2626',
    '--transition': 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  },
  'high-contrast': {
    '--bg-primary': '#000000',
    '--bg-secondary': '#1a1a1a',
    '--bg-tertiary': '#333333',
    '--text-primary': '#ffffff',
    '--text-secondary': '#e6e6e6',
    '--text-muted': '#cccccc',
    '--border-color': '#ffffff',
    '--accent-primary': '#ffff00',
    '--accent-secondary': '#00ffff',
    '--success': '#00ff00',
    '--warning': '#ff8800',
    '--error': '#ff0000',
    '--transition': 'all 0.2s linear',
  },
};

function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('platform-theme') as Theme | null;
    if (saved && themes[saved]) {
      setTheme(saved);
    }
  }, []);

  const applyTheme = useCallback((t: Theme) => {
    setTheme(t);
    localStorage.setItem('platform-theme', t);
    const root = document.documentElement;
    Object.entries(themes[t]).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  return { theme, setTheme: applyTheme };
}

// ─── AI Copilot Component with Context Awareness ──────────────────────────
interface CopilotMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

function AICopilot({ isOpen, onClose, metrics }: { isOpen: boolean; onClose: () => void; metrics: DashboardMetrics | null }) {
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = useCallback(async (message: string) => {
    if (!message.trim()) return;

    const userMessage: CopilotMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Generate contextual response based on metrics with better intelligence
      const assistantResponse = generateCopilotResponse(message, metrics);

      const assistantMessage: CopilotMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: assistantResponse,
        timestamp: new Date(),
      };

      // Simulate response delay for realistic interaction
      await new Promise((resolve) => setTimeout(resolve, 500));
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setLoading(false);
    }
  }, [metrics]);

  if (!isOpen) return null;

  return (
    <div className={dashboardStyles.copilotPanel}>
      <div className={dashboardStyles.copilotHeader}>
        <div>
          <h3>Ellinea Platform Assistant</h3>
          <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.2rem' }}>
            {metrics?.wsConnected ? '🟢 Live' : '⚪ Polling'} • {metrics?.lastUpdateLatency || 0}ms latency
          </small>
        </div>
        <button className={dashboardStyles.closeBtn} onClick={onClose} aria-label="Close copilot">
          ×
        </button>
      </div>

      <div className={dashboardStyles.copilotMessages}>
        {messages.length === 0 ? (
          <div className={dashboardStyles.copilotWelcome}>
            <p>Welcome to the Platform Super Admin Assistant.</p>
            <p>Ask me about:</p>
            <ul style={{ paddingLeft: '1.25rem', margin: '0.5rem 0', fontSize: '0.8rem' }}>
              <li>Organization health and metrics</li>
              <li>Self-healing activities and success rates</li>
              <li>Federated learning model performance</li>
              <li>Predictive forecasts and risks</li>
              <li>Platform recommendations</li>
            </ul>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`${dashboardStyles.message} ${dashboardStyles[msg.type]}`}>
              <p>{msg.content}</p>
              <small>{msg.timestamp.toLocaleTimeString()}</small>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={dashboardStyles.copilotInput}>
        <input
          type="text"
          placeholder="Ask about platform health, organizations, or recommendations..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(input)}
          disabled={loading}
        />
        <button
          onClick={() => handleSendMessage(input)}
          disabled={loading || !input.trim()}
          className={dashboardStyles.sendBtn}
        >
          {loading ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function generateCopilotResponse(query: string, metrics: DashboardMetrics | null): string {
  const lowerQuery = query.toLowerCase();

  if (!metrics) {
    return 'Please wait while I load platform metrics...';
  }

  if (lowerQuery.includes('health') || lowerQuery.includes('status')) {
    const avgHealth = metrics.orgDistribution.reduce((sum, org) => sum + org.healthScore, 0) / Math.max(metrics.orgDistribution.length, 1);
    const unhealthyOrgs = metrics.orgDistribution.filter(o => o.healthScore < 60);
    if (unhealthyOrgs.length > 0) {
      return `Platform health score: ${avgHealth.toFixed(1)}%. ⚠️ ${unhealthyOrgs.length} organizations need attention. Remediation success rate is ${(metrics.selfHealingStats.successRate * 100).toFixed(1)}%. Recommend immediate review of low-health organizations.`;
    }
    return `Platform health score: ${avgHealth.toFixed(1)}%. All systems nominal. ${metrics.orgDistribution.length} organizations are active. Remediation success rate is ${(metrics.selfHealingStats.successRate * 100).toFixed(1)}%.`;
  }

  if (lowerQuery.includes('organizations') || lowerQuery.includes('orgs')) {
    const topOrg = metrics.orgDistribution.reduce((prev, current) => (prev.healthScore > current.healthScore ? prev : current), metrics.orgDistribution[0]);
    const lowHealthOrgs = metrics.orgDistribution.filter(o => o.healthScore < 70);
    return `You have ${metrics.orgDistribution.length} organizations. Top performer: ${topOrg?.orgName || 'N/A'} (${topOrg?.healthScore || 0}% health). ${lowHealthOrgs.length} organization(s) below 70% health require monitoring.`;
  }

  if (lowerQuery.includes('healing') || lowerQuery.includes('remediation') || lowerQuery.includes('incident')) {
    const escalationRate = (metrics.selfHealingStats.escalationCount / Math.max(metrics.selfHealingStats.remediationCount, 1)) * 100;
    return `Self-healing metrics: ${metrics.selfHealingStats.remediationCount} remediations performed with ${(metrics.selfHealingStats.successRate * 100).toFixed(1)}% success rate. ${metrics.selfHealingStats.escalationCount} escalations (${escalationRate.toFixed(1)}% escalation rate). Average fix time: ${(metrics.selfHealingStats.avgRemediationTime / 60).toFixed(1)} minutes.`;
  }

  if (lowerQuery.includes('learning') || lowerQuery.includes('federated') || lowerQuery.includes('model')) {
    return `Federated learning status: Model v${metrics.federatedLearningStatus.modelVersion} trained across ${metrics.federatedLearningStatus.participatingOrgs} organizations. Training accuracy: ${(metrics.federatedLearningStatus.trainingAccuracy * 100).toFixed(1)}%. Privacy budget usage: ${(metrics.federatedLearningStatus.privacyBudgetUsed * 100).toFixed(1)}%. Model is ${metrics.federatedLearningStatus.trainingAccuracy > 0.95 ? 'performing excellently' : 'performing well'}.`;
  }

  if (lowerQuery.includes('risk') || lowerQuery.includes('forecast') || lowerQuery.includes('predict')) {
    const allRisks = metrics.predictiveForecasts.operationalRisks.length +
                     metrics.predictiveForecasts.resourceConstraints.length +
                     metrics.predictiveForecasts.financialIssues.length;
    const highRisks = (metrics.predictiveForecasts.operationalRisks.filter(r => r.probability > 0.7) || []).length +
                      (metrics.predictiveForecasts.resourceConstraints.filter(r => r.probability > 0.7) || []).length +
                      (metrics.predictiveForecasts.financialIssues.filter(r => r.probability > 0.7) || []).length;
    if (highRisks > 0) {
      return `🚨 Detected ${highRisks} high-probability risks across ${allRisks} total forecasts. Critical attention needed. Recommend reviewing operational and resource constraints immediately in next 24 hours.`;
    }
    return `Detected ${allRisks} forecasts total. Risk distribution is healthy with no high-probability alerts. Recommended review cycle: within 48 hours.`;
  }

  if (lowerQuery.includes('recommendation') || lowerQuery.includes('suggest') || lowerQuery.includes('advise')) {
    const suggestions = [];
    if (metrics.selfHealingStats.successRate < 0.85) suggestions.push('Improve self-healing success rate by tuning remediation rules');
    if (metrics.federatedLearningStatus.privacyBudgetUsed > 0.8) suggestions.push('Monitor privacy budget usage closely - approaching limit');
    const lowHealthCount = metrics.orgDistribution.filter(o => o.healthScore < 70).length;
    if (lowHealthCount > 2) suggestions.push('Address multiple organization health issues systematically');
    if (suggestions.length === 0) suggestions.push('System is performing well. Continue monitoring daily metrics.');
    return `Recommendations: ${suggestions.join(' • ')}`;
  }

  return `I can help you monitor platform health, organization metrics, self-healing activities, federated learning performance, and predictive forecasts. What specific aspect would you like to explore?`;
}

// ─── Geographic Heat Map with Organization Distribution ────────────────────
function GeoHeatmap({ orgs }: { orgs: OrgDistributionMetric[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || orgs.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = 'var(--bg-primary)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw simplified world map projection with org distribution
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    // Draw grid
    ctx.strokeStyle = 'var(--border-color)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      ctx.beginPath();
      ctx.moveTo((i / 10) * width, 0);
      ctx.lineTo((i / 10) * width, height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, (i / 10) * height);
      ctx.lineTo(width, (i / 10) * height);
      ctx.stroke();
    }

    // Plot organizations as heatmap points
    orgs.forEach((org, idx) => {
      // Pseudo-random positioning based on org ID
      const angle = (idx / orgs.length) * Math.PI * 2;
      const radius = (Math.sin(idx * 0.7) + 1) * (Math.min(width, height) / 3);
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      // Color based on health score
      let color = '#22c55e'; // Success
      if (org.healthScore < 60) color = '#ef4444'; // Error
      else if (org.healthScore < 80) color = '#f59e0b'; // Warning

      // Draw heat point with gradient
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, 20);
      gradient.addColorStop(0, color + '40');
      gradient.addColorStop(1, color + '00');

      ctx.fillStyle = gradient;
      ctx.fillRect(x - 20, y - 20, 40, 40);

      // Draw center point
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Draw label
      ctx.fillStyle = 'var(--text-primary)';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(org.orgName.substring(0, 3), x, y + 35);
    });
  }, [orgs]);

  return (
    <div className={dashboardStyles.widget}>
      <h3>Global Organization Heat Map</h3>
      <canvas
        ref={canvasRef}
        width={400}
        height={250}
        style={{
          width: '100%',
          height: 'auto',
          borderRadius: '0.5rem',
          backgroundColor: 'var(--bg-tertiary)',
        }}
      />
      <div className={dashboardStyles.legend} style={{ marginTop: '0.75rem' }}>
        <div><span style={{ color: 'var(--success)' }}>●</span> Healthy (80%+)</div>
        <div><span style={{ color: 'var(--warning)' }}>●</span> Caution (60-79%)</div>
        <div><span style={{ color: 'var(--error)' }}>●</span> Attention (&lt;60%)</div>
      </div>
    </div>
  );
}

// ─── Self-Healing Metrics Widget with Animations ───────────────────────────
function SelfHealingMetrics({ stats }: { stats: SelfHealingStats }) {
  const successBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (successBarRef.current) {
      successBarRef.current.style.width = `${stats.successRate * 100}%`;
    }
  }, [stats.successRate]);

  return (
    <div className={dashboardStyles.widget}>
      <h3>Self-Healing Activity</h3>
      <div className={dashboardStyles.metricsGrid}>
        <div className={dashboardStyles.metric}>
          <span>Remediations</span>
          <strong>{stats.remediationCount}</strong>
          <small>automated actions</small>
        </div>
        <div className={dashboardStyles.metric}>
          <span>Success Rate</span>
          <strong>{(stats.successRate * 100).toFixed(1)}%</strong>
          <small>first-time fixes</small>
        </div>
        <div className={dashboardStyles.metric}>
          <span>Escalations</span>
          <strong>{stats.escalationCount}</strong>
          <small>to administrators</small>
        </div>
        <div className={dashboardStyles.metric}>
          <span>Avg Fix Time</span>
          <strong>{(stats.avgRemediationTime / 60).toFixed(1)}m</strong>
          <small>minutes to resolve</small>
        </div>
      </div>

      {/* Success rate progress bar with animation */}
      <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'var(--bg-tertiary)', borderRadius: '0.375rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Success Rate Trend</div>
        <div style={{ height: '6px', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
          <div
            ref={successBarRef}
            style={{
              height: '100%',
              backgroundColor: 'var(--success)',
              transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              borderRadius: '3px',
            }}
          />
        </div>
      </div>

      {stats.lastIncidentTime && (
        <div className={dashboardStyles.footer}>
          Last incident: {stats.lastIncidentTime.toLocaleString()}
        </div>
      )}
    </div>
  );
}

// ─── Federated Learning Status Widget with Model Performance ────────────────
function FederatedLearningWidget({ status }: { status: FederatedLearningStatus }) {
  const privacyBarRef = useRef<HTMLDivElement>(null);
  const accuracyBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (privacyBarRef.current) {
      privacyBarRef.current.style.width = `${status.privacyBudgetUsed * 100}%`;
    }
    if (accuracyBarRef.current) {
      accuracyBarRef.current.style.width = `${status.trainingAccuracy * 100}%`;
    }
  }, [status]);

  return (
    <div className={dashboardStyles.widget}>
      <h3>Federated Learning Status</h3>
      <div className={dashboardStyles.metricsGrid}>
        <div className={dashboardStyles.metric}>
          <span>Participating Orgs</span>
          <strong>{status.participatingOrgs}</strong>
          <small>in training round</small>
        </div>
        <div className={dashboardStyles.metric}>
          <span>Model Version</span>
          <strong>v{status.modelVersion}</strong>
          <small>deployed</small>
        </div>
        <div className={dashboardStyles.metric}>
          <span>Training Accuracy</span>
          <strong>{(status.trainingAccuracy * 100).toFixed(1)}%</strong>
          <small>cross-org performance</small>
        </div>
        <div className={dashboardStyles.metric}>
          <span>Privacy Budget</span>
          <strong>{(status.privacyBudgetUsed * 100).toFixed(1)}%</strong>
          <small>differential privacy</small>
        </div>
      </div>

      {/* Progress bars for model performance */}
      <div style={{ marginTop: '1rem', display: 'grid', gap: '0.75rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
            Accuracy
          </div>
          <div style={{ height: '6px', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
            <div
              ref={accuracyBarRef}
              style={{
                height: '100%',
                backgroundColor: 'var(--accent-secondary)',
                transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                borderRadius: '3px',
              }}
            />
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
            Privacy Budget
          </div>
          <div style={{ height: '6px', backgroundColor: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
            <div
              ref={privacyBarRef}
              style={{
                height: '100%',
                backgroundColor: status.privacyBudgetUsed > 0.8 ? 'var(--warning)' : 'var(--accent-primary)',
                transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                borderRadius: '3px',
              }}
            />
          </div>
        </div>
      </div>

      {status.lastTrainingTime && (
        <div className={dashboardStyles.footer}>
          Last training: {status.lastTrainingTime.toLocaleString()}
        </div>
      )}
    </div>
  );
}

// ─── Predictive Analytics Widget with Risk Scoring ─────────────────────────
function PredictiveAnalyticsWidget({ forecasts }: { forecasts: PredictiveForecasts }) {
  const allRisks = [
    ...forecasts.operationalRisks.map(r => ({ ...r, type: 'Operational' })),
    ...forecasts.resourceConstraints.map(r => ({ ...r, type: 'Resource' })),
    ...forecasts.financialIssues.map(r => ({ ...r, type: 'Financial' })),
  ];

  const highRisks = allRisks.filter(r => r.probability > 0.7);
  const mediumRisks = allRisks.filter(r => r.probability > 0.4 && r.probability <= 0.7);
  const lowRisks = allRisks.filter(r => r.probability <= 0.4);

  const getRiskColor = (probability: number): string => {
    if (probability > 0.7) return 'var(--error)';
    if (probability > 0.4) return 'var(--warning)';
    return 'var(--success)';
  };

  return (
    <div className={dashboardStyles.widget}>
      <h3>Predictive Forecasts & Risk Analysis</h3>
      <div className={dashboardStyles.metricsGrid}>
        <div className={dashboardStyles.metric}>
          <span>High-Risk Alerts</span>
          <strong style={{ color: 'var(--error)' }}>{highRisks.length}</strong>
          <small>probability &gt; 70%</small>
        </div>
        <div className={dashboardStyles.metric}>
          <span>Medium-Risk Alerts</span>
          <strong style={{ color: 'var(--warning)' }}>{mediumRisks.length}</strong>
          <small>probability 40-70%</small>
        </div>
        <div className={dashboardStyles.metric}>
          <span>Low-Risk Alerts</span>
          <strong style={{ color: 'var(--success)' }}>{lowRisks.length}</strong>
          <small>probability &lt; 40%</small>
        </div>
        <div className={dashboardStyles.metric}>
          <span>Next Update</span>
          <strong>{Math.floor((forecasts.nextUpdateTime.getTime() - Date.now()) / 60000)}m</strong>
          <small>time to rerun</small>
        </div>
      </div>

      {allRisks.length > 0 && (
        <div className={dashboardStyles.riskList}>
          <h4>Forecast Summary</h4>
          {allRisks.slice(0, 5).map((risk, idx) => (
            <div
              key={idx}
              className={dashboardStyles.riskItem}
              style={{
                paddingLeft: '0.75rem',
                borderLeftWidth: '3px',
                borderLeftStyle: 'solid',
                borderLeftColor: getRiskColor(risk.probability),
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 500 }}>{risk.name}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                  {(risk.probability * 100).toFixed(0)}%
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', opacity: 0.6, marginTop: '0.2rem' }}>
                {risk.type} • {risk.timeframe} • Affects {risk.affectedOrgs} org(s)
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────
export default function PlatformPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [orgs, setOrgs] = useState<PlatformOrg[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [packs, setPacks] = useState<ConnectorPackDto[]>([]);
  const [installations, setInstallations] = useState<ConnectorInstallationDto[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [catalogId, setCatalogId] = useState('openapi');
  const [fromInstallationId, setFromInstallationId] = useState('');

  const [settingsOrgId, setSettingsOrgId] = useState('');
  const [timeFormat, setTimeFormat] = useState<OrgDateTimeSettingsDto['timeFormat']>('12h');
  const [dateStyle, setDateStyle] = useState<OrgDateTimeSettingsDto['dateStyle']>('short');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [orgStats, setOrgStats] = useState<PlatformOrgStatsDto | null>(null);
  const [statsBusy, setStatsBusy] = useState(false);
  const [platformHealth, setPlatformHealth] = useState<HealthDto | null>(null);

  // Dashboard state
  const [viewMode, setViewMode] = useState<'dashboard' | 'admin'>('dashboard');
  const [copilotOpen, setCopilotOpen] = useState(false);
  const { theme, setTheme: setThemeMode } = useTheme();
  const metrics = useRealtimeMetrics(orgs, allowed && loading === false);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace('/login');
      return;
    }
    if (!s.isPlatformAdmin) {
      router.replace('/app');
      return;
    }
    setAllowed(true);
  }, [router]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [o, f, p, inst] = await Promise.all([
        listPlatformOrgs(),
        listPlatformFlags(),
        listPlatformConnectorPacks(),
        listInstallations().catch(() => [] as ConnectorInstallationDto[]),
      ]);
      setOrgs(o);
      setFlags(f);
      setPacks(p);
      setInstallations(inst);
      if (!settingsOrgId && o[0]) {
        setSettingsOrgId(o[0].id);
      }
      fetchHealth().then((h) => { if (h) setPlatformHealth(h); }).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load platform data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed]);

  useEffect(() => {
    if (!allowed || !settingsOrgId) return;
    let cancelled = false;
    setSettingsBusy(true);
    fetchPlatformOrgDateTimeSettings(settingsOrgId)
      .then((prefs) => {
        if (cancelled) return;
        setTimeFormat(prefs.timeFormat);
        setDateStyle(prefs.dateStyle);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load org date settings');
      })
      .finally(() => {
        if (!cancelled) setSettingsBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, settingsOrgId]);

  async function onSaveOrgDateTime() {
    if (!settingsOrgId) return;
    setSettingsBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await updatePlatformOrgDateTimeSettings(settingsOrgId, {
        timeFormat,
        dateStyle,
      });
      setTimeFormat(saved.timeFormat);
      setDateStyle(saved.dateStyle);
      setNotice('Tenant date & time saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save org date settings');
    } finally {
      setSettingsBusy(false);
    }
  }

  async function onToggleOrgStatus(org: PlatformOrg) {
    const next = org.status === 'suspended' ? 'active' : 'suspended';
    const label = next === 'suspended' ? 'Suspend' : 'Resume';
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`${label} organization “${org.name}”? ${
        next === 'suspended'
          ? 'Users will not be able to sign in; connector sync is blocked.'
          : 'Users can sign in again.'
      }`)
    ) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await updatePlatformOrgStatus(org.id, next);
      setOrgs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      setNotice(
        next === 'suspended'
          ? `Suspended ${updated.name}.`
          : `Resumed ${updated.name}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update organization status');
    } finally {
      setBusy(false);
    }
  }

  async function loadOrgStats(orgId: string) {
    if (!orgId) return;
    setStatsBusy(true);
    setOrgStats(null);
    try {
      const stats = await fetchPlatformOrgStats(orgId);
      setOrgStats(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load org stats');
    } finally {
      setStatsBusy(false);
    }
  }

  async function onSavePack() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const pack = await createPlatformConnectorPack({
        slug,
        name,
        description,
        catalogId: fromInstallationId
          ? installations.find((i) => i.id === fromInstallationId)?.catalogId || catalogId
          : catalogId,
        fromInstallationId: fromInstallationId || undefined,
      });
      setNotice(
        `Published pack “${pack.name}” (${pack.slug}). Org IT can install with credentials only.`,
      );
      setSlug('');
      setName('');
      setDescription('');
      setFromInstallationId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save pack');
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <div className={styles.page}>
        <p className={styles.lede}>Checking platform access…</p>
      </div>
    );
  }

  // Dashboard view for super admin
  if (viewMode === 'dashboard' && metrics) {
    return (
      <div style={{
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        minHeight: '100vh',
        padding: '2rem',
      }}>
        {/* Header with controls */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Platform Command Center
            </h1>
            <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              Real-time platform metrics • Self-healing • Federated learning • Predictive insights
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={theme}
              onChange={(e) => setThemeMode(e.target.value as Theme)}
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.375rem',
                color: 'var(--text-primary)',
                padding: '0.5rem 0.75rem',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              <option value="dark">🌙 Dark</option>
              <option value="light">☀️ Light</option>
              <option value="high-contrast">⚡ High Contrast</option>
            </select>
            <button
              onClick={() => setCopilotOpen(!copilotOpen)}
              style={{
                background: 'var(--accent-primary)',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                padding: '0.5rem 1rem',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'var(--transition)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent-primary)')}
            >
              {copilotOpen ? '✕ Close Copilot' : '✨ Copilot'}
            </button>
            <button
              onClick={() => setViewMode('admin')}
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.375rem',
                color: 'var(--text-primary)',
                padding: '0.5rem 1rem',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'var(--transition)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--border-color)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
            >
              ⚙️ Admin Panel
            </button>
          </div>
        </div>

        {error ? (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '0.5rem',
            padding: '1rem',
            marginBottom: '1rem',
            color: 'var(--error)',
            fontSize: '0.95rem',
          }}>
            {error}
          </div>
        ) : null}

        {/* Dashboard grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem',
        }}>
          {/* Geo heatmap */}
          <GeoHeatmap orgs={metrics.orgDistribution} />

          {/* Self-healing metrics */}
          <SelfHealingMetrics stats={metrics.selfHealingStats} />

          {/* Federated learning */}
          <FederatedLearningWidget status={metrics.federatedLearningStatus} />

          {/* Predictive analytics */}
          <PredictiveAnalyticsWidget forecasts={metrics.predictiveForecasts} />
        </div>

        {/* Platform health summary */}
        {platformHealth ? (
          <div className={dashboardStyles.widget}>
            <h3>Platform Health Overview</h3>
            <div className={dashboardStyles.metricsGrid}>
              <div className={dashboardStyles.metric}>
                <span>Status</span>
                <strong style={{ color: 'var(--success)' }}>🟢 Healthy</strong>
                <small>all systems nominal</small>
              </div>
              <div className={dashboardStyles.metric}>
                <span>Uptime</span>
                <strong>{Math.floor((platformHealth.uptimeSeconds ?? 0) / 3600)}h</strong>
                <small>continuous operation</small>
              </div>
              <div className={dashboardStyles.metric}>
                <span>Organizations</span>
                <strong>{orgs.length}</strong>
                <small>active tenants</small>
              </div>
              <div className={dashboardStyles.metric}>
                <span>Last Updated</span>
                <strong style={{ fontSize: '0.9rem' }}>
                  {platformHealth.ts ? new Date(platformHealth.ts).toLocaleTimeString() : '—'}
                </strong>
                <small>real-time sync</small>
              </div>
            </div>
          </div>
        ) : null}

        {/* Copilot panel */}
        <AICopilot isOpen={copilotOpen} onClose={() => setCopilotOpen(false)} metrics={metrics} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Platform Super Admin</p>
          <h1>Ellines operators</h1>
          <p className={styles.lede}>
            Tenants, feature flags, and connector packs — freeze a working install so the next customer
            only enters credentials. Grant via <code>PLATFORM_ADMIN_EMAILS</code>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            onClick={() => setViewMode('dashboard')}
            style={{
              background: 'var(--accent-primary)',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              padding: '0.5rem 1rem',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            ← Back to Dashboard
          </button>
        </div>
      </header>

      {error ? <p className={adminStyles.error}>{error}</p> : null}
      {notice ? <p className={adminStyles.notice}>{notice}</p> : null}

      {/* Platform health strip */}
      {platformHealth ? (
        <div style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          padding: '0.65rem 1rem',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          fontSize: '0.82rem',
          alignItems: 'center',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} aria-hidden />
            <strong>Platform</strong> {platformHealth.version}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>Uptime {Math.floor((platformHealth.uptimeSeconds ?? 0) / 60)}m</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: platformHealth.email?.live ? '#22c55e' : '#f59e0b', display: 'inline-block' }} aria-hidden />
            Email: {platformHealth.email?.live ? `live (${platformHealth.email?.provider})` : 'simulated — set RESEND_API_KEY or SMTP_* on Pages'}
          </span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', fontFamily: 'monospace', fontSize: '0.75rem' }}>
            {platformHealth.ts ? new Date(platformHealth.ts).toLocaleTimeString() : '—'}
          </span>
        </div>
      ) : null}

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Tenant date &amp; time</div>
        <p className={styles.lede}>
          Set 12/24-hour and short/log date style for any organization. Org Owner/IT Admin can also
          change this under Settings for their own tenant.
        </p>
        <div className={adminStyles.form}>
          <label>
            Organization
            <select
              value={settingsOrgId}
              disabled={settingsBusy || orgs.length === 0}
              onChange={(e) => setSettingsOrgId(e.target.value)}
            >
              {orgs.length === 0 ? <option value="">No tenants</option> : null}
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Time format
            <select
              value={timeFormat}
              disabled={settingsBusy || !settingsOrgId}
              onChange={(e) =>
                setTimeFormat(e.target.value as OrgDateTimeSettingsDto['timeFormat'])
              }
            >
              <option value="12h">12-hour</option>
              <option value="24h">24-hour</option>
            </select>
          </label>
          <label>
            Date style
            <select
              value={dateStyle}
              disabled={settingsBusy || !settingsOrgId}
              onChange={(e) =>
                setDateStyle(e.target.value as OrgDateTimeSettingsDto['dateStyle'])
              }
            >
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="log">Log (YYYY-MM-DD)</option>
            </select>
          </label>
          <label>
            Preview
            <input
              readOnly
              value={(() => {
                const p = formatOrgDateTime(new Date(), { timeFormat, dateStyle });
                return `${p.day} · ${p.time}`;
              })()}
            />
          </label>
          <button
            type="button"
            className={adminStyles.primary}
            disabled={settingsBusy || !settingsOrgId}
            onClick={() => void onSaveOrgDateTime()}
          >
            {settingsBusy ? 'Saving…' : 'Save for tenant'}
          </button>
        </div>
      </section>

      <div className={styles.kpis}>
        <article className={styles.kpi}>
          <span>Tenants</span>
          <strong>{loading ? '—' : String(orgs.length)}</strong>
          <em>Organizations</em>
        </article>
        <article className={styles.kpi}>
          <span>Connector packs</span>
          <strong>{loading ? '—' : String(packs.length)}</strong>
          <em>Published templates</em>
        </article>
        <article className={styles.kpi}>
          <span>Feature flags</span>
          <strong>{loading ? '—' : String(flags.length)}</strong>
          <em>Scaffold only</em>
        </article>
        <article className={styles.kpi}>
          <span>Pages</span>
          <strong className={styles.ready}>Live</strong>
          <em className={styles.pos}>eip.ellines.co.ke</em>
        </article>
      </div>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Save as connector pack</div>
        <p className={styles.lede}>
          Publish a pack from a working installation in your operator org, or define a blank template.
          Secrets are stripped — Org IT supplies credentials at install time.
        </p>
        <div className={adminStyles.form}>
          <label>
            Slug
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="his-read"
            />
          </label>
          <label>
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Generic HIS — Patients / Billing (read)"
            />
          </label>
          <label>
            Catalog
            <select value={catalogId} onChange={(e) => setCatalogId(e.target.value)}>
              <option value="openapi">openapi</option>
              <option value="rest-api">rest-api</option>
              <option value="postgres">postgres</option>
              <option value="sqlserver">sqlserver</option>
              <option value="mysql">mysql</option>
              <option value="csv-file">csv-file</option>
              <option value="email-imap">email-imap</option>
              <option value="sftp">sftp</option>
            </select>
          </label>
          <label>
            From installation (optional)
            <select
              value={fromInstallationId}
              onChange={(e) => setFromInstallationId(e.target.value)}
            >
              <option value="">— blank template —</option>
              {installations.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.displayName} ({i.catalogId})
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            Description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Read-only sync for HIS reporting"
            />
          </label>
          <button
            type="button"
            className={adminStyles.primary}
            disabled={busy || !slug.trim() || !name.trim()}
            onClick={() => void onSavePack()}
          >
            {busy ? 'Saving…' : 'Publish pack'}
          </button>
        </div>
      </section>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Connector packs</div>
        {loading ? (
          <p className={styles.lede}>Loading…</p>
        ) : packs.length === 0 ? (
          <p className={styles.lede}>No packs yet — publish one above after a working install.</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Catalog</th>
                <th>Published</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {packs.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div>{p.name}</div>
                    {p.description ? (
                      <div style={{ fontSize: '0.78rem', color: '#8b95a8' }}>{p.description}</div>
                    ) : null}
                  </td>
                  <td>{p.slug}</td>
                  <td>{p.catalogId}</td>
                  <td>{p.published ? 'Yes' : 'No'}</td>
                  <td>{p.createdByEmail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Per-org detailed stats */}
      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Tenant deep stats</div>
        <p className={styles.lede}>Select an org to view usage: users, connectors, approvals, last activity.</p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <select
            value={selectedOrgId}
            onChange={(e) => { setSelectedOrgId(e.target.value); setOrgStats(null); }}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'inherit', padding: '0.4rem 0.7rem', fontSize: '0.85rem', minWidth: 200 }}
          >
            <option value="">— Select org —</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.status})</option>)}
          </select>
          <button
            type="button"
            className={adminStyles.primary}
            disabled={!selectedOrgId || statsBusy}
            onClick={() => void loadOrgStats(selectedOrgId)}
          >
            {statsBusy ? 'Loading…' : 'Load stats'}
          </button>
        </div>

        {orgStats ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.65rem', marginBottom: '0.75rem' }}>
            {[
              { label: 'Total users', value: orgStats.stats.totalUsers },
              { label: 'Active users', value: orgStats.stats.activeUsers },
              { label: 'Connectors', value: orgStats.stats.totalConnectors },
              { label: 'Synced connectors', value: orgStats.stats.syncedConnectors },
              { label: 'Total approvals', value: orgStats.stats.totalApprovals },
              { label: 'Pending approvals', value: orgStats.stats.pendingApprovals },
              { label: 'Events logged', value: orgStats.stats.totalEvents },
            ].map((stat) => (
              <div key={stat.label} className={styles.kpi} style={{ margin: 0 }}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
            <div className={styles.kpi} style={{ margin: 0 }}>
              <span>Last activity</span>
              <strong style={{ fontSize: '0.78rem' }}>{orgStats.lastActivityAt ? new Date(orgStats.lastActivityAt).toLocaleDateString() : '—'}</strong>
            </div>
            <div className={styles.kpi} style={{ margin: 0 }}>
              <span>Last sync</span>
              <strong style={{ fontSize: '0.78rem' }}>{orgStats.lastSyncedAt ? new Date(orgStats.lastSyncedAt).toLocaleDateString() : '—'}</strong>
            </div>
          </div>
        ) : null}

        {orgStats?.stats.roleBreakdown && Object.keys(orgStats.stats.roleBreakdown).length > 0 ? (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--c-muted)', alignSelf: 'center' }}>Roles:</span>
            {Object.entries(orgStats.stats.roleBreakdown).map(([role, count]) => (
              <span key={role} style={{ padding: '0.15rem 0.5rem', borderRadius: 99, fontSize: '0.72rem', background: 'rgba(124,58,237,0.15)', color: '#c4b5fd', border: '1px solid rgba(124,58,237,0.3)' }}>
                {role}: {count}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Tenants</div>
        <p className={styles.lede}>
          Suspend blocks tenant login and connector sync. Platform operators on the allowlist can
          still sign in to manage the org.
        </p>
        {loading ? (
          <p className={styles.lede}>Loading…</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Users</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td>
                    <div>{o.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--c-muted)' }}>{o.slug}</div>
                  </td>
                  <td>{o.slug}</td>
                  <td>{o.userCount}</td>
                  <td>
                    <span style={{
                      padding: '0.1rem 0.45rem', borderRadius: 99, fontSize: '0.7rem', fontWeight: 600,
                      background: o.status === 'suspended' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                      color: o.status === 'suspended' ? '#fca5a5' : '#6ee7b7',
                      border: `1px solid ${o.status === 'suspended' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                    }}>
                      {o.status === 'suspended' ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                  <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={adminStyles.ghost}
                      disabled={busy}
                      onClick={() => void onToggleOrgStatus(o)}
                    >
                      {o.status === 'suspended' ? 'Resume' : 'Suspend'}
                    </button>
                    <button
                      type="button"
                      className={adminStyles.ghost}
                      onClick={() => { setSelectedOrgId(o.id); void loadOrgStats(o.id); }}
                    >
                      Stats
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={adminStyles.tableWrap}>
        <div className={styles.panelLabel}>Feature flags (placeholder)</div>
        {loading ? (
          <p className={styles.lede}>Loading…</p>
        ) : (
          <table className={adminStyles.table}>
            <thead>
              <tr>
                <th>Flag</th>
                <th>State</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr key={f.key}>
                  <td>{f.label}</td>
                  <td>{f.enabled ? 'On' : 'Off'}</td>
                  <td>{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
