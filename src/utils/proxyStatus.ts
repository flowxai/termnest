import type { AppConfig, ProjectConfig, ProxyConfig, ProxyOverrideConfig } from '../types';

export interface EffectiveProxyState {
  enabled: boolean;
  empty: boolean;
  values: ProxyConfig;
  project?: ProjectConfig;
}

function isNonEmpty(value: string | undefined): boolean {
  return (value ?? '').trim().length > 0;
}

export function hasProxyValues(proxy: Pick<ProxyConfig, 'allProxy' | 'httpProxy' | 'httpsProxy'>): boolean {
  return isNonEmpty(proxy.allProxy) || isNonEmpty(proxy.httpProxy) || isNonEmpty(proxy.httpsProxy);
}

function mergeProxy(base: ProxyConfig, override?: ProxyOverrideConfig): ProxyConfig {
  if (!override) return base;
  return {
    ...base,
    allProxy: isNonEmpty(override.allProxy) ? override.allProxy : base.allProxy,
    httpProxy: isNonEmpty(override.httpProxy) ? override.httpProxy : base.httpProxy,
    httpsProxy: isNonEmpty(override.httpsProxy) ? override.httpsProxy : base.httpsProxy,
  };
}

export function getEffectiveProxyState(config: Pick<AppConfig, 'projects' | 'proxy'>, projectId: string | null): EffectiveProxyState {
  const project = config.projects.find((item) => item.id === projectId);
  let resolved: ProxyConfig = { ...config.proxy };

  if (project) {
    switch (project.proxyMode) {
      case 'disabled':
        resolved.enabled = false;
        break;
      case 'enabled':
        resolved.enabled = true;
        resolved = mergeProxy(resolved, project.proxyOverride);
        break;
      case 'inherit':
      default:
        break;
    }
  }

  return {
    enabled: resolved.enabled,
    empty: resolved.enabled && !hasProxyValues(resolved),
    values: resolved,
    project,
  };
}
