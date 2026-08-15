import { Injectable, Logger } from '@nestjs/common';
import { UserContextProfile } from '@prisma/client';

/**
 * AiResponseTailor — Adjusts AI responses based on user context.
 * Modifies verbosity, terminology, and focus based on role and preferences.
 *
 * Implements Requirement 19.3:
 * "THE Ellinea_AI SHALL tailor responses and recommendations to user role and context"
 */
@Injectable()
export class AiResponseTailor {
  private readonly logger = new Logger(AiResponseTailor.name);

  /**
   * Tailor an AI response based on user context.
   * Adjusts verbosity, terminology, and depth.
   */
  async tailorResponse(
    baseResponse: string,
    profile: UserContextProfile,
    responseType?: string,
  ): Promise<string> {
    try {
      let tailored = baseResponse;

      // Apply verbosity adjustment
      tailored = this.adjustVerbosity(
        tailored,
        profile.verbosityLevel,
      );

      // Apply terminology adjustment
      tailored = this.adjustTerminology(
        tailored,
        profile.preferredTerminology,
      );

      // Apply role-specific adjustments
      tailored = this.applyRoleAdjustments(
        tailored,
        profile.role,
        responseType,
      );

      return tailored;
    } catch (error) {
      this.logger.error('Failed to tailor response:', error);
      return baseResponse;
    }
  }

  /**
   * Adjust response verbosity.
   */
  private adjustVerbosity(
    response: string,
    verbosityLevel: string,
  ): string {
    if (verbosityLevel === 'concise') {
      // Remove explanatory phrases
      let concise = response
        .replace(/In other words,?\s*/gi, '')
        .replace(/Essentially,?\s*/gi, '')
        .replace(/To elaborate,?\s*/gi, '')
        .replace(/Furthermore,?\s*/gi, '')
        .replace(/It should be noted that\s*/gi, '')
        .replace(/\(/g, '') // Remove parenthetical explanations (simplified)
        .replace(/\)/g, '');

      // Truncate to first 2 sentences if very long
      const sentences = concise.split(/[.!?]+/).filter((s) => s.trim());
      if (sentences.length > 3) {
        concise = sentences.slice(0, 2).join('. ') + '.';
      }

      return concise;
    } else if (verbosityLevel === 'detailed') {
      // Add context and examples
      // In real implementation, this would be more sophisticated
      return response + '\n\nFor more context, consider the following factors...';
    }

    // 'medium' - return as-is
    return response;
  }

  /**
   * Adjust terminology based on user preference.
   */
  private adjustTerminology(
    response: string,
    terminology: string,
  ): string {
    const technicalToBusinessMap: Record<string, string> = {
      'API endpoint': 'connection',
      'database query': 'data lookup',
      'aggregation': 'summary',
      'normalization': 'standardization',
      'latency': 'response time',
      'throughput': 'processing capacity',
      'cache invalidation': 'refresh',
      'payload': 'data',
      'synchronization': 'sync',
      'deprecated': 'outdated',
      'legacy': 'older',
      'migrate': 'move',
      'cluster': 'group',
      'shard': 'partition',
      'rollback': 'undo',
      'fallback': 'backup option',
    };

    const technicalToSimpleMap: Record<string, string> = {
      ...technicalToBusinessMap,
      'metric': 'measure',
      'threshold': 'limit',
      'algorithm': 'method',
      'parameter': 'setting',
      'validation': 'check',
      'correlation': 'connection',
      'variance': 'difference',
      'anomaly': 'unusual pattern',
    };

    if (terminology === 'business') {
      let adjusted = response;
      Object.entries(technicalToBusinessMap).forEach(([tech, business]) => {
        const regex = new RegExp(tech, 'gi');
        adjusted = adjusted.replace(regex, business);
      });
      return adjusted;
    } else if (terminology === 'simple') {
      let adjusted = response;
      Object.entries(technicalToSimpleMap).forEach(([tech, simple]) => {
        const regex = new RegExp(tech, 'gi');
        adjusted = adjusted.replace(regex, simple);
      });
      return adjusted;
    }

    // 'technical' - return as-is
    return response;
  }

  /**
   * Apply role-specific adjustments to response.
   */
  private applyRoleAdjustments(
    response: string,
    role: string,
    responseType?: string,
  ): string {
    if (role === 'owner' || role === 'executive') {
      // Add business impact summary
      if (!response.toLowerCase().includes('business impact')) {
        return response + '\n\n**Business Impact**: This affects strategic decision-making.';
      }
    } else if (role === 'admin') {
      // Add technical details and troubleshooting
      if (!response.toLowerCase().includes('troubleshoot')) {
        return (
          response +
          '\n\n**Technical Note**: For troubleshooting, check system logs at /var/log/...'
        );
      }
    } else if (role === 'member' || role === 'viewer') {
      // Simplify and focus on user actions
      return response.replace(
        /Technical[^.]*\./gi,
        'For help, contact your administrator.',
      );
    }

    return response;
  }

  /**
   * Generate focus areas based on role.
   */
  async generateFocusAreas(profile: UserContextProfile): Promise<string[]> {
    const focusMap: Record<string, string[]> = {
      owner: [
        'Strategic metrics',
        'Business outcomes',
        'Risk management',
        'Growth opportunities',
      ],
      admin: [
        'System health',
        'Performance metrics',
        'Security',
        'Operational efficiency',
      ],
      manager: [
        'Team performance',
        'Resource allocation',
        'Project status',
        'Deadline tracking',
      ],
      member: [
        'Task completion',
        'Daily metrics',
        'Collaboration',
        'Alerts',
      ],
      viewer: [
        'Summary reports',
        'Key metrics',
        'Trend analysis',
      ],
    };

    return focusMap[profile.role] || [];
  }

  /**
   * Tailor a recommendation based on user context.
   */
  async tailorRecommendation(
    baseRecommendation: string,
    profile: UserContextProfile,
    confidence: number,
  ): Promise<{
    recommendation: string;
    tailored: boolean;
    confidence: number;
    focusAreas: string[];
  }> {
    try {
      const tailored = await this.tailorResponse(
        baseRecommendation,
        profile,
        'recommendation',
      );
      const focusAreas = await this.generateFocusAreas(profile);

      return {
        recommendation: tailored,
        tailored: tailored !== baseRecommendation,
        confidence,
        focusAreas,
      };
    } catch (error) {
      this.logger.error('Failed to tailor recommendation:', error);
      return {
        recommendation: baseRecommendation,
        tailored: false,
        confidence,
        focusAreas: [],
      };
    }
  }
}
