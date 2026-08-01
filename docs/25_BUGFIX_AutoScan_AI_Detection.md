# Bug Fix: Auto-Scan AI System Detection

**Issue:** Auto-scan probe returns raw HTTP responses but doesn't use Ellinea AI to detect system type (Hospital Management System, ERP, CRM, etc.).

**Root Cause:** `POST /api/v1/connectors/autoscan/probe` probes URLs but doesn't analyze responses via Ellinea AI to determine system type.

**Solution:** Add AI analysis step after probe to classify system.

---

## Current Flow

```
User enters URL → Probe reachability → Return HTTP headers/title → UI shows "None — generic REST/OpenAPI"
```

**Problem:** No system type detected. User must manually choose catalog hint.

---

## Fixed Flow

```
User enters URL → Probe reachability → Analyze response via Ellinea AI
                                        ↓
                              AI classifies system type (HIS, ERP, CRM, etc.)
                                        ↓
                              Return suggested catalog (Hospidia, SAP, Salesforce, etc.)
```

---

## Implementation

### Add Ellinea AI Detection Service

```typescript
// services/identity/src/connectors/system-detector.service.ts

export class SystemDetectorService {
  /**
   * Use Ellinea AI to analyze HTTP response and detect system type.
   */
  async detectSystemType(probeResult: {
    url: string;
    status: number;
    title?: string;
    contentType?: string;
    server?: string;
    snippet?: string;
  }): Promise<{
    systemType: 'his' | 'erp' | 'crm' | 'hr' | 'finance' | 'generic' | 'unknown';
    confidence: number;
    suggestions: string[];  // ['Hospidia', 'Epic', 'SAP', ...]
  }> {
    const prompt = `
You are a system detection AI for enterprise integrations. Analyze this HTTP response and classify the system type.

URL: ${probeResult.url}
Status: ${probeResult.status}
Title: ${probeResult.title || 'none'}
Server: ${probeResult.server || 'unknown'}
Content-Type: ${probeResult.contentType || 'unknown'}
Body snippet: ${probeResult.snippet?.slice(0, 500) || 'empty'}

Classify as ONE of: HIS (Hospital/Healthcare), ERP (Finance/Inventory), CRM (Sales/Customer), HR (Human Resources), Finance, Generic API, Unknown.

Respond with JSON:
{
  "type": "his" | "erp" | "crm" | "hr" | "finance" | "generic" | "unknown",
  "confidence": 0.0 to 1.0,
  "reasoning": "Why you think this",
  "suggestions": ["SuggestedSystem1", "SuggestedSystem2"]
}
    `;

    // Call Ellinea AI (or local LLM if OPENAI_API_KEY not set)
    const response = await this.callLlm(prompt);
    
    try {
      const parsed = JSON.parse(response);
      return {
        systemType: parsed.type,
        confidence: parsed.confidence,
        suggestions: parsed.suggestions || [],
      };
    } catch {
      return {
        systemType: 'unknown',
        confidence: 0,
        suggestions: [],
      };
    }
  }

  private async callLlm(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY || process.env.ELLINEA_LLM_API_KEY;
    if (!apiKey) {
      // Fallback: rule-based detection
      return this.fallbackDetection(prompt);
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,  // Low temperature for classification
        max_tokens: 200,
      }),
    });

    const data = await response.json() as Record<string, unknown>;
    const message = (data.choices as Array<{ message: { content: string } }>)?.[0]?.message?.content;
    return message || '';
  }

  /**
   * Fallback rule-based detection (when no LLM available).
   */
  private fallbackDetection(prompt: string): string {
    const lower = prompt.toLowerCase();

    // HIS Keywords
    if (/hospital|clinic|patient|appointment|med|ehr|his|health|diagnostic|lab|pharmacy|nursing/i.test(lower)) {
      return JSON.stringify({
        type: 'his',
        confidence: 0.85,
        reasoning: 'Healthcare keywords detected',
        suggestions: ['Hospidia', 'Epic', 'Cerner', 'HealthSoft'],
      });
    }

    // ERP Keywords
    if (/erp|sap|finance|inventory|order|supplier|purchase|stock|warehouse|manufacturing/i.test(lower)) {
      return JSON.stringify({
        type: 'erp',
        confidence: 0.85,
        reasoning: 'ERP keywords detected',
        suggestions: ['SAP', 'NetSuite', 'Dynamics 365', 'Infor'],
      });
    }

    // CRM Keywords
    if (/crm|salesforce|customer|lead|opportunity|deal|pipeline|contact|account|hubspot/i.test(lower)) {
      return JSON.stringify({
        type: 'crm',
        confidence: 0.85,
        reasoning: 'CRM keywords detected',
        suggestions: ['Salesforce', 'HubSpot', 'Pipedrive', 'Dynamics CRM'],
      });
    }

    // HR Keywords
    if (/hr|payroll|employee|workforce|adp|workday|recruitment|succession|learning/i.test(lower)) {
      return JSON.stringify({
        type: 'hr',
        confidence: 0.85,
        reasoning: 'HR keywords detected',
        suggestions: ['ADP', 'Workday', 'BambooHR', 'SuccessFactors'],
      });
    }

    // Finance Keywords
    if (/quickbooks|xero|accounting|ledger|invoice|receipt|balance|tax|audit/i.test(lower)) {
      return JSON.stringify({
        type: 'finance',
        confidence: 0.80,
        reasoning: 'Finance keywords detected',
        suggestions: ['QuickBooks', 'Xero', 'Netsuite', 'Sage'],
      });
    }

    // Generic
    return JSON.stringify({
      type: 'generic',
      confidence: 0.5,
      reasoning: 'No specific system detected',
      suggestions: [],
    });
  }
}
```

### Update Probe Endpoint

```typescript
// apps/web/functions/api/v1/connectors/autoscan/probe.ts

// Import AI detector
import { SystemDetectorService } from '../../../../services/identity/src/connectors/system-detector.service';

export const onRequest: PagesFunction<Env> = async (context) => {
  // ... existing probe code ...

  const results: ProbeItem[] = [];
  for (const t of targets) {
    const probeResult = await probeOne(t, timeoutMs);
    results.push(probeResult);

    // NEW: If reachable, run AI detection
    if (probeResult.reachable) {
      const detector = new SystemDetectorService();
      const detection = await detector.detectSystemType(probeResult);
      
      probeResult.detection = detection;  // Add to response
    }
  }

  return json({
    mode: 'online-edge',
    catalogId: body.catalogId || null,
    limits: {
      maxTargets: MAX_TARGETS,
      timeoutMs,
      note: 'Probes URLs + uses AI to detect system type',
    },
    results,  // Now includes detection hints
  });
};
```

### Update UI to Show AI Suggestions

```typescript
// apps/web/src/app/app/connectors/ConnectorAutoscan.tsx

export function AutoscanResults({ results }) {
  return (
    <div>
      {results.map(result => (
        <div key={result.url} className="probe-result">
          <h3>{result.url}</h3>
          
          {result.reachable ? (
            <>
              <p>✅ Reachable (HTTP {result.status})</p>
              <p>Title: {result.title || 'none'}</p>
              
              {/* NEW: Show AI Detection */}
              {result.detection && (
                <div className="ai-detection">
                  <h4>Ellinea AI Analysis:</h4>
                  <p>System Type: <strong>{result.detection.systemType}</strong></p>
                  <p>Confidence: {Math.round(result.detection.confidence * 100)}%</p>
                  
                  {result.detection.suggestions.length > 0 && (
                    <div>
                      <p>Suggested Templates:</p>
                      <ul>
                        {result.detection.suggestions.map(sug => (
                          <li key={sug}>
                            <button onClick={() => selectTemplate(sug)}>
                              Use {sug}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p>❌ Not reachable: {result.error}</p>
          )}
        </div>
      ))}
    </div>
  );
}
```

---

## Why It Was Missing

The original autoscan was designed as a **bare reachability probe** (can IT reach this URL?), but the **AI detection step** wasn't implemented. The UI shows hardcoded hints, but they're not based on analyzing the actual system.

---

## Testing

```bash
# Test with real hospital system
curl -X POST http://localhost:3001/api/v1/connectors/autoscan/probe \
  -H 'Authorization: Bearer ...' \
  -d '{
    "targets": ["https://hospital.example.com/api"],
    "timeoutMs": 3000
  }'

# Response now includes:
{
  "results": [{
    "url": "https://hospital.example.com/api",
    "reachable": true,
    "title": "Hospital Management System v3.2",
    "detection": {
      "systemType": "his",
      "confidence": 0.95,
      "suggestions": ["Hospidia", "Epic", "Cerner"]
    }
  }]
}
```

---

## Deployment

1. Add `system-detector.service.ts` to Identity service
2. Update probe endpoint
3. Update UI to show suggestions
4. Test with 5+ real systems
5. Deploy to production

**Time:** 4–6 hours  
**Risk:** Low (read-only, no data changes)

