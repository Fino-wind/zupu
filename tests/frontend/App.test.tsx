import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import App from '../../App';

// Mock Lucide icons to avoid render issues in jsdom (optional, but cleaner)
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual<typeof import('lucide-react')>('lucide-react');
  return { ...actual };
});

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('App Component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorageMock.clear();
    // Default fetch response (empty members)
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);
  });

  it('renders title', async () => {
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByText('华夏族谱录')).toBeInTheDocument();
  });

  it('shows "开宗立派" when no members exist', async () => {
    await act(async () => {
      render(<App />);
    });
    // Wait for fetch
    await waitFor(() => {
      expect(screen.getByText('开宗立派')).toBeInTheDocument();
    });
  });

  it('allows creating root member', async () => {
    await act(async () => {
      render(<App />);
    });

    // Wait for form
    const input = await screen.findByPlaceholderText('如：袁');
    fireEvent.change(input, { target: { value: '李' } });

    // Mock save response AND ensure subsequent fetch returns data
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Success', id: 'M-123' }), // save response
    });

    // The App component might trigger a re-fetch or local update.
    // If it relies on local state update: setMembers(prev => [...prev, root])
    // That should be enough.

    // NOTE: The issue might be that "李氏始祖" is inside the canvas/D3 which jsdom doesn't render fully,
    // OR it renders but testing-library has trouble finding text in SVG/absolute divs if they are hidden/off-screen?
    // Looking at App.tsx: FamilyGraph -> DraggableNode -> div with text.
    // The text is rendered inside a div: <h3 ...>{node.data.name}</h3>

    // Let's debug by checking what IS rendered.
    // screen.debug();

    const button = screen.getByText(/确立 李 氏始祖/);
    fireEvent.click(button);

    await waitFor(
      () => {
        expect(screen.getByText('开宗立派成功')).toBeInTheDocument();
        expect(screen.getByText('宗主亲临')).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});
