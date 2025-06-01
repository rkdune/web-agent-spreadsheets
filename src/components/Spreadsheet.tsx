'use client';

import { useState } from 'react';
import { Plus, MoreHorizontal, Bot, Edit3, X, AlertCircle, RefreshCw, Zap } from 'lucide-react';
import { aiService } from '../services/aiService';

interface Cell {
  value: string;
  isGenerating?: boolean;
  source?: string;
  error?: string;
}

interface Column {
  id: string;
  name: string;
  prompt?: string;
  isAIColumn?: boolean;
}

const initialColumns: Column[] = [
  { id: 'company', name: 'Company', isAIColumn: false },
  { 
    id: 'website', 
    name: 'Website', 
    prompt: 'Find the official website URL for this company. Look for their main corporate website, not social media or directory listings.',
    isAIColumn: true 
  },
  { 
    id: 'email', 
    name: 'Contact Email', 
    prompt: 'Research and find a business contact email for this company. Look for sales, info, or general inquiry email addresses.',
    isAIColumn: true 
  },
  { 
    id: 'phone', 
    name: 'Phone Number', 
    prompt: 'Find the main business phone number for this company. Prefer toll-free numbers or main office lines.',
    isAIColumn: true 
  },
  { 
    id: 'source', 
    name: 'Source URL', 
    prompt: 'Provide the URL where you found the information about this company. This should be a reliable business directory or the company\'s own website.',
    isAIColumn: true 
  },
];

const initialData: Record<string, Cell>[] = [
  {
    company: { value: 'Riot Games' },
    website: { value: 'https://www.riotgames.com' },
    email: { value: 'info@riotgames.com' },
    phone: { value: '' },
    source: { value: 'https://www.riotgames.com' },
  },
  {
    company: { value: 'Epic Games' },
    website: { value: 'https://www.epicgames.com' },
    email: { value: '' },
    phone: { value: '(919) 854-0070' },
    source: { value: 'https://www.epicgames.com' },
  },
  {
    company: { value: 'Valve Corporation' },
    website: { value: 'https://www.valvesoftware.com' },
    email: { value: 'gaben@valvesoftware.com' },
    phone: { value: '(425) 889-9642' },
    source: { value: 'https://www.valvesoftware.com' },
  },
  {
    company: { value: 'Blizzard Entertainment' },
    website: { value: 'https://www.blizzard.com' },
    email: { value: 'careers@blizzard.com' },
    phone: { value: '(949) 955-1380' },
    source: { value: 'https://www.blizzard.com' },
  },
  {
    company: { value: 'Naughty Dog' },
    website: { value: 'https://www.naughtydog.com' },
    email: { value: '' },
    phone: { value: '' },
    source: { value: 'https://www.naughtydog.com' },
  },
  {
    company: { value: 'CD Projekt RED' },
    website: { value: 'https://www.cdprojektred.com' },
    email: { value: 'jobs@cdprojektred.com' },
    phone: { value: '+48 22 519 69 00' },
    source: { value: 'https://www.cdprojektred.com' },
  },
  {
    company: { value: 'Rockstar Games' },
    website: { value: 'https://www.rockstargames.com' },
    email: { value: 'info@rockstargames.com' },
    phone: { value: '(646) 536-2842' },
    source: { value: 'https://www.rockstargames.com' },
  },
  {
    company: { value: 'Insomniac Games' },
    website: { value: 'https://insomniac.games' },
    email: { value: 'jobs@insomniac.games' },
    phone: { value: '' },
    source: { value: 'https://insomniac.games' },
  },
  {
    company: { value: 'FromSoftware' },
    website: { value: '' },
    email: { value: '' },
    phone: { value: '' },
    source: { value: '' },
  },
  {
    company: { value: 'Bungie' },
    website: { value: 'https://www.bungie.net' },
    email: { value: 'careers@bungie.com' },
    phone: { value: '(425) 440-6800' },
    source: { value: 'https://www.bungie.net' },
  },
];

export default function Spreadsheet() {
  const [columns, setColumns] = useState<Column[]>(initialColumns);
  const [data, setData] = useState<Record<string, Cell>[]>(initialData);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [editingHeader, setEditingHeader] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: string } | null>(null);
  const [promptEditor, setPromptEditor] = useState<{ columnId: string; isOpen: boolean }>({ columnId: '', isOpen: false });
  const [fillingColumns, setFillingColumns] = useState<Set<string>>(new Set());

  const addColumn = () => {
    const newId = `col_${Date.now()}`;
    setColumns([...columns, { id: newId, name: 'New Column', isAIColumn: false }]);
    setData(data.map(row => ({ ...row, [newId]: { value: '' } })));
  };

  const addRow = () => {
    const newRow: Record<string, Cell> = {};
    columns.forEach(col => {
      newRow[col.id] = { value: '' };
    });
    setData([...data, newRow]);
  };

  const updateCell = (rowIndex: number, colId: string, value: string) => {
    const newData = [...data];
    newData[rowIndex][colId] = { value, isGenerating: false };
    setData(newData);
  };

  const updateColumnName = (colId: string, newName: string) => {
    setColumns(columns.map(col => 
      col.id === colId ? { ...col, name: newName } : col
    ));
  };

  const updateColumnPrompt = (colId: string, prompt: string) => {
    setColumns(columns.map(col => 
      col.id === colId ? { ...col, prompt, isAIColumn: prompt.length > 0 } : col
    ));
  };

  const fillColumn = async (columnId: string) => {
    const column = columns.find(col => col.id === columnId);
    if (!column?.isAIColumn || !column.prompt) return;

    // Mark column as being filled
    setFillingColumns(prev => new Set([...prev, columnId]));

    try {
      // Find all empty cells in this column
      const emptyCellIndices = data
        .map((row, index) => ({ row: row[columnId], index }))
        .filter(({ row }) => !row?.value || row.value.trim() === '')
        .map(({ index }) => index);

      // Process cells in batches to avoid overwhelming the API
      const batchSize = 3;
      for (let i = 0; i < emptyCellIndices.length; i += batchSize) {
        const batch = emptyCellIndices.slice(i, i + batchSize);
        
        // Process batch in parallel
        await Promise.all(
          batch.map(rowIndex => generateCellContent(rowIndex, columnId))
        );

        // Small delay between batches to be respectful to the API
        if (i + batchSize < emptyCellIndices.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error('Error filling column:', error);
    } finally {
      // Remove column from filling state
      setFillingColumns(prev => {
        const newSet = new Set(prev);
        newSet.delete(columnId);
        return newSet;
      });
    }
  };

  const handleCellClick = async (rowIndex: number, colId: string) => {
    const column = columns.find(col => col.id === colId);
    const cell = data[rowIndex][colId];
    
    // If it's an AI column with a prompt and the cell is empty, trigger AI generation
    if (column?.isAIColumn && column.prompt && (!cell?.value || cell.value.trim() === '')) {
      await generateCellContent(rowIndex, colId);
    } else {
      // Otherwise, enter edit mode
      setEditingCell({ row: rowIndex, col: colId });
    }
    
    setSelectedCell({ row: rowIndex, col: colId });
  };

  const generateCellContent = async (rowIndex: number, colId: string) => {
    const column = columns.find(col => col.id === colId);
    if (!column?.prompt) return;

    // Set loading state
    const newData = [...data];
    newData[rowIndex][colId] = { 
      value: '', 
      isGenerating: true,
      error: undefined 
    };
    setData(newData);

    try {
      // Extract context from other cells in the same row
      const rowData = data[rowIndex];
      const context = aiService.extractContext(rowData, colId);

      // Convert rowData to the format expected by the API
      const rowDataForAPI: Record<string, string> = {};
      Object.entries(rowData).forEach(([key, cell]) => {
        rowDataForAPI[key] = cell?.value || '';
      });

      // Make AI API call
      const result = await aiService.fillCellWithRetry(
        column.prompt,
        context,
        colId,
        rowDataForAPI
      );

      // Update cell with result
      const updatedData = [...data];
      if (result.success) {
        updatedData[rowIndex][colId] = {
          value: result.value,
          source: result.source,
          isGenerating: false,
          error: undefined
        };
      } else {
        updatedData[rowIndex][colId] = {
          value: '',
          isGenerating: false,
          error: result.error || 'Failed to generate content'
        };
      }
      setData(updatedData);

    } catch (error) {
      // Handle unexpected errors
      const updatedData = [...data];
      updatedData[rowIndex][colId] = {
        value: '',
        isGenerating: false,
        error: error instanceof Error ? error.message : 'Unexpected error occurred'
      };
      setData(updatedData);
    }
  };

  const retryGeneration = async (rowIndex: number, colId: string) => {
    await generateCellContent(rowIndex, colId);
  };

  const clearCellError = (rowIndex: number, colId: string) => {
    const newData = [...data];
    newData[rowIndex][colId] = { 
      value: '', 
      error: undefined,
      isGenerating: false 
    };
    setData(newData);
  };

  const handleCellBlur = () => {
    setEditingCell(null);
  };

  const handleHeaderClick = (colId: string) => {
    setEditingHeader(colId);
  };

  const handleHeaderBlur = () => {
    setEditingHeader(null);
  };

  const openPromptEditor = (columnId: string) => {
    setPromptEditor({ columnId, isOpen: true });
    setEditingHeader(null);
  };

  const closePromptEditor = () => {
    setPromptEditor({ columnId: '', isOpen: false });
  };

  const getSelectedCellInfo = () => {
    if (!selectedCell) return '';
    
    const cell = data[selectedCell.row]?.[selectedCell.col];
    return cell?.value || '';
  };

  const cellContent = getSelectedCellInfo();

  return (
    <div className="w-full">
      {/* Combined Header with Cell Viewer and Toolbar */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50">
        <div className="flex-1">
          <p className="text-sm text-gray-700">
            {cellContent || 'Select a cell to view its content'}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={addColumn}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border rounded-md hover:bg-gray-50 transition-colors"
          >
            <Plus size={16} />
            Add Column
          </button>
          <button
            onClick={addRow}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border rounded-md hover:bg-gray-50 transition-colors"
          >
            <Plus size={16} />
            Add Row
          </button>
        </div>
      </div>

      {/* Spreadsheet Grid */}
      <div className="overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="w-12 p-2 border-r border-gray-200 text-center text-sm font-medium text-gray-500">
                #
              </th>
              {columns.map((column) => (
                <th
                  key={column.id}
                  className={`min-w-[200px] p-2 border-r border-gray-200 text-left ${
                    column.isAIColumn ? 'bg-blue-50' : 'bg-gray-50'
                  }`}
                >
                  {editingHeader === column.id ? (
                    <input
                      type="text"
                      value={column.name}
                      onChange={(e) => updateColumnName(column.id, e.target.value)}
                      onBlur={handleHeaderBlur}
                      onKeyDown={(e) => e.key === 'Enter' && handleHeaderBlur()}
                      className="w-full px-2 py-1 text-sm font-medium bg-white border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  ) : (
                    <div className="flex items-center justify-between">
                      <div
                        onClick={() => handleHeaderClick(column.id)}
                        className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded flex-1"
                      >
                        {column.isAIColumn && (
                          <Bot size={14} className="text-blue-600" />
                        )}
                        <span className={`text-sm font-medium ${
                          column.isAIColumn ? 'text-blue-700' : 'text-gray-700'
                        }`}>
                          {column.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {column.isAIColumn && column.prompt && (
                          <button
                            onClick={() => fillColumn(column.id)}
                            disabled={fillingColumns.has(column.id)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Fill all empty cells in this column"
                          >
                            {fillingColumns.has(column.id) ? (
                              <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <Zap size={14} className="text-green-600" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => openPromptEditor(column.id)}
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                          title={column.isAIColumn ? 'Edit AI prompt' : 'Add AI prompt'}
                        >
                          {column.isAIColumn ? (
                            <Edit3 size={14} className="text-blue-600" />
                          ) : (
                            <MoreHorizontal size={14} className="text-gray-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-gray-50">
                <td className="p-2 border-r border-b border-gray-200 text-center text-sm text-gray-500">
                  {rowIndex + 1}
                </td>
                {columns.map((column) => {
                  const cell = row[column.id] || { value: '' };
                  const isEditing = editingCell?.row === rowIndex && editingCell?.col === column.id;
                  
                  return (
                    <td
                      key={column.id}
                      className="p-0 border-r border-b border-gray-200 min-w-[200px]"
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={cell.value}
                          onChange={(e) => updateCell(rowIndex, column.id, e.target.value)}
                          onBlur={handleCellBlur}
                          onKeyDown={(e) => e.key === 'Enter' && handleCellBlur()}
                          className="w-full p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                          autoFocus
                        />
                      ) : (
                        <div
                          onClick={() => handleCellClick(rowIndex, column.id)}
                          className="p-2 min-h-[40px] cursor-pointer hover:bg-blue-50 transition-colors"
                        >
                          {cell.isGenerating ? (
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                              <span className="text-sm text-blue-600">Generating...</span>
                            </div>
                          ) : cell.error ? (
                            <div className="flex items-center gap-2">
                              <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-red-600 truncate" title={cell.error}>
                                  Error: {cell.error}
                                </p>
                                <div className="flex gap-1 mt-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      retryGeneration(rowIndex, column.id);
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                  >
                                    <RefreshCw size={12} />
                                    Retry
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      clearCellError(rowIndex, column.id);
                                    }}
                                    className="text-xs text-gray-500 hover:text-gray-700 ml-2"
                                  >
                                    Clear
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : cell.value.startsWith('http') ? (
                            <a
                              href={cell.value}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {cell.value}
                            </a>
                          ) : cell.value ? (
                            <div>
                              <span className="text-sm text-gray-900">{cell.value}</span>
                              {cell.source && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {(cell.source.startsWith('http') || cell.source.includes('http')) ? (
                                    <div className="flex flex-wrap gap-1">
                                      <span>Source: </span>
                                      {cell.source.split(', ').map((url, index) => (
                                        url.trim().startsWith('http') ? (
                                          <a
                                            key={index}
                                            href={url.trim()}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline"
                                            onClick={(e) => e.stopPropagation()}
                                            title={url.trim()}
                                          >
                                            {new URL(url.trim()).hostname}
                                            {index < cell.source!.split(', ').length - 1 && ', '}
                                          </a>
                                        ) : (
                                          <span key={index}>
                                            {url.trim()}
                                            {index < cell.source!.split(', ').length - 1 && ', '}
                                          </span>
                                        )
                                      ))}
                                    </div>
                                  ) : (
                                    <p title={cell.source}>
                                      Source: {cell.source}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : column.isAIColumn && column.prompt ? (
                            <div className="flex items-center gap-2 text-blue-600">
                              <Bot size={14} />
                              <span className="text-sm">Click to generate</span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">Click to edit</span>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Prompt Editor Modal */}
      {promptEditor.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <Bot size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">
                  AI Prompt for &quot;{columns.find(col => col.id === promptEditor.columnId)?.name}&quot;
                </h2>
              </div>
              <button
                onClick={closePromptEditor}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            
            <div className="p-4">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AI Instruction
                </label>
                <p className="text-sm text-gray-600 mb-3">
                  Describe what the AI should research and fill in for this column. Be specific about the type of information you want.
                </p>
                <textarea
                  value={columns.find(col => col.id === promptEditor.columnId)?.prompt || ''}
                  onChange={(e) => updateColumnPrompt(promptEditor.columnId, e.target.value)}
                  placeholder="Example: Find the official website URL for this company."
                  className="w-full h-32 p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Bot size={16} className="text-blue-600" />
                  <span>
                    {columns.find(col => col.id === promptEditor.columnId)?.prompt 
                      ? 'AI will use this prompt to fill cells automatically'
                      : 'Add a prompt to enable AI for this column'
                    }
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={closePromptEditor}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={closePromptEditor}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Save Prompt
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 