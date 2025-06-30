'use client';

import { useState } from 'react';
import { Plus, MoreHorizontal, Bot, Edit3, X, AlertCircle, RefreshCw, Zap, FlaskConical, Trash2 } from 'lucide-react';
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
  model?: 'gpt-4o-mini' | 'gpt-4.1';
}

interface EvaluationResult {
  promptA: {
    mini: string[];
    gpt41: string[];
    accuracy: number;
    cost: number;
    avgResponseTime: number;
  };
  promptB: {
    mini: string[];
    gpt41: string[];
    accuracy: number;
    cost: number;
    avgResponseTime: number;
  };
  disagreementScore: number; // % disagreement between GPT-4.1 results of both prompts
}

interface PromptEvaluation {
  columnId: string;
  isOpen: boolean;
  promptA: string;
  promptB: string;
  isRunning: boolean;
  results?: EvaluationResult;
}

const initialColumns: Column[] = [
  { id: 'company', name: 'Company', isAIColumn: false },
  { 
    id: 'website', 
    name: 'Website', 
    prompt: 'Find the official website URL for this company. Look for their main corporate website, not social media or directory listings.',
    isAIColumn: true,
    model: 'gpt-4o-mini'
  },
  { 
    id: 'email', 
    name: 'Contact Email', 
    prompt: 'Research and find a business contact email for this company. Look for sales, info, or general inquiry email addresses.',
    isAIColumn: true,
    model: 'gpt-4o-mini'
  },
  { 
    id: 'phone', 
    name: 'Phone Number', 
    prompt: 'Find the main business phone number for this company. Prefer toll-free numbers or main office lines.',
    isAIColumn: true,
    model: 'gpt-4o-mini'
  },
];

const initialData: Record<string, Cell>[] = [
  {
    company: { value: 'Riot Games' },
    website: { value: 'https://www.riotgames.com' },
    email: { value: 'info@riotgames.com' },
    phone: { value: '' },
  },
  {
    company: { value: 'Epic Games' },
    website: { value: 'https://www.epicgames.com' },
    email: { value: '' },
    phone: { value: '(919) 854-0070' },
  },
  {
    company: { value: 'Valve Corporation' },
    website: { value: 'https://www.valvesoftware.com' },
    email: { value: 'gaben@valvesoftware.com' },
    phone: { value: '(425) 889-9642' },
  },
  {
    company: { value: 'Blizzard Entertainment' },
    website: { value: 'https://www.blizzard.com' },
    email: { value: 'careers@blizzard.com' },
    phone: { value: '(949) 955-1380' },
  },
  {
    company: { value: 'CD Projekt RED' },
    website: { value: 'https://www.cdprojektred.com' },
    email: { value: 'jobs@cdprojektred.com' },
    phone: { value: '+48 22 519 69 00' },
  },
  {
    company: { value: 'Rockstar Games' },
    website: { value: 'https://www.rockstargames.com' },
    email: { value: 'info@rockstargames.com' },
    phone: { value: '(646) 536-2842' },
  },
  {
    company: { value: 'Insomniac Games' },
    website: { value: 'https://insomniac.games' },
    email: { value: 'jobs@insomniac.games' },
    phone: { value: '' },
  },
  {
    company: { value: 'FromSoftware' },
    website: { value: '' },
    email: { value: '' },
    phone: { value: '' },
  },
  {
    company: { value: 'Bungie' },
    website: { value: 'https://www.bungie.net' },
    email: { value: 'careers@bungie.com' },
    phone: { value: '(425) 440-6800' },
  },
];

export default function Spreadsheet() {
  const [columns, setColumns] = useState<Column[]>(initialColumns);
  const [data, setData] = useState<Record<string, Cell>[]>(initialData);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [editingHeader, setEditingHeader] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: string } | null>(null);
  const [promptEditor, setPromptEditor] = useState<PromptEvaluation>({ columnId: '', isOpen: false, promptA: '', promptB: '', isRunning: false });
  const [promptEvaluator, setPromptEvaluator] = useState<PromptEvaluation>({ columnId: '', isOpen: false, promptA: '', promptB: '', isRunning: false });
  const [fillingColumns, setFillingColumns] = useState<Set<string>>(new Set());
  const [promptEditorModel, setPromptEditorModel] = useState<'gpt-4o-mini' | 'gpt-4.1'>('gpt-4o-mini');
  const [contactModalOpen, setContactModalOpen] = useState<boolean>(false);

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

  const deleteColumn = (columnId: string) => {
    // Don't allow deleting the last column
    if (columns.length <= 1) return;
    
    // Remove column from columns array
    setColumns(columns.filter(col => col.id !== columnId));
    
    // Remove column data from all rows
    setData(data.map(row => {
      const newRow = { ...row };
      delete newRow[columnId];
      return newRow;
    }));
  };

  const deleteRow = (rowIndex: number) => {
    // Don't allow deleting the last row
    if (data.length <= 1) return;
    
    setData(data.filter((_, index) => index !== rowIndex));
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

  const savePromptWithComplexity = async (colId: string, prompt: string, manualModel?: 'gpt-4o-mini' | 'gpt-4.1') => {
    let selectedModel = manualModel;
    
    // If no manual model specified, assess complexity automatically
    if (!manualModel && prompt.trim()) {
      const complexity = await assessPromptComplexity(prompt);
      selectedModel = (complexity === 'simple' || complexity === 'medium') ? 'gpt-4o-mini' : 'gpt-4.1';
      setPromptEditorModel(selectedModel);
    }
    
    setColumns(columns.map(col => 
      col.id === colId ? { 
        ...col, 
        prompt, 
        isAIColumn: prompt.length > 0,
        model: selectedModel || 'gpt-4o-mini'
      } : col
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
      const result = await aiService.fillCellWithModel(
        column.prompt,
        context,
        colId,
        rowDataForAPI,
        column.model || 'gpt-4o-mini'
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
    const column = columns.find(col => col.id === columnId);
    setPromptEditor({ columnId, isOpen: true, promptA: '', promptB: '', isRunning: false });
    setPromptEditorModel(column?.model || 'gpt-4o-mini');
    setEditingHeader(null);
  };

  const closePromptEditor = () => {
    setPromptEditor({ columnId: '', isOpen: false, promptA: '', promptB: '', isRunning: false });
    setPromptEditorModel('gpt-4o-mini');
  };

  const openPromptEvaluator = (columnId: string) => {
    const column = columns.find(col => col.id === columnId);
    setPromptEvaluator({ 
      columnId, 
      isOpen: true, 
      promptA: column?.prompt || '', 
      promptB: '', 
      isRunning: false 
    });
    setEditingHeader(null);
  };

  const closePromptEvaluator = () => {
    setPromptEvaluator({ columnId: '', isOpen: false, promptA: '', promptB: '', isRunning: false });
  };

  const runPromptEvaluation = async () => {
    if (!promptEvaluator.promptA || !promptEvaluator.promptB) return;

    setPromptEvaluator(prev => ({ ...prev, isRunning: true }));

    try {
      const results = await evaluatePrompts(
        promptEvaluator.columnId,
        promptEvaluator.promptA,
        promptEvaluator.promptB
      );

      setPromptEvaluator(prev => ({ ...prev, results, isRunning: false }));
    } catch (error) {
      console.error('Evaluation failed:', error);
      setPromptEvaluator(prev => ({ ...prev, isRunning: false }));
    }
  };

  const evaluatePrompts = async (columnId: string, promptA: string, promptB: string): Promise<EvaluationResult> => {
    const contextData = data.map(row => {
      const context = aiService.extractContext(row, columnId);
      const rowDataForAPI: Record<string, string> = {};
      Object.entries(row).forEach(([key, cell]) => {
        rowDataForAPI[key] = cell?.value || '';
      });
      return { context, rowData: rowDataForAPI };
    });

    // Run all combinations
    const [promptAMini, promptAGpt41, promptBMini, promptBGpt41] = await Promise.all([
      runPromptOnModel(promptA, contextData, 'gpt-4o-mini'),
      runPromptOnModel(promptA, contextData, 'gpt-4.1'),
      runPromptOnModel(promptB, contextData, 'gpt-4o-mini'),
      runPromptOnModel(promptB, contextData, 'gpt-4.1')
    ]);

    // Calculate accuracy by comparing mini results to gpt41 results
    const promptAAccuracy = await calculateAccuracy(promptAMini.results, promptAGpt41.results);
    const promptBAccuracy = await calculateAccuracy(promptBMini.results, promptBGpt41.results);

    // Calculate disagreement between GPT-4.1 results (Prompt A as GT vs Prompt B)
    const disagreementScore = await calculateDisagreementScore(promptAGpt41.results, promptBGpt41.results);

    return {
      promptA: {
        mini: promptAMini.results,
        gpt41: promptAGpt41.results,
        accuracy: promptAAccuracy,
        cost: promptAMini.cost + promptAGpt41.cost,
        avgResponseTime: (promptAMini.avgTime + promptAGpt41.avgTime) / 2
      },
      promptB: {
        mini: promptBMini.results,
        gpt41: promptBGpt41.results,
        accuracy: promptBAccuracy,
        cost: promptBMini.cost + promptBGpt41.cost,
        avgResponseTime: (promptBMini.avgTime + promptBGpt41.avgTime) / 2
      },
      disagreementScore
    };
  };

  const runPromptOnModel = async (
    prompt: string, 
    contextData: Array<{ context: Record<string, string>; rowData: Record<string, string> }>,
    model: string
  ) => {
    const results: string[] = [];
    let totalCost = 0;
    let totalTime = 0;

    for (const { context, rowData } of contextData) {
      const startTime = Date.now();
      
      try {
        const result = await aiService.fillCellWithModel(prompt, context, 'eval', rowData, model);
        results.push(result.success ? result.value : 'Error');
        
        // Estimate cost (rough approximation)
        const tokens = prompt.length / 4 + (result.value?.length || 0) / 4;
        totalCost += model === 'gpt-4.1' ? tokens * 0.00015 : tokens * 0.000001; // Rough pricing
        
      } catch {
        results.push('Error');
      }
      
      totalTime += Date.now() - startTime;
    }

    return {
      results,
      cost: totalCost,
      avgTime: totalTime / contextData.length
    };
  };

  const calculateAccuracy = async (miniResults: string[], gpt41Results: string[]): Promise<number> => {
    let matches = 0;
    
    for (let i = 0; i < miniResults.length; i++) {
      try {
        const comparison = await aiService.compareResults(miniResults[i], gpt41Results[i]);
        if (comparison.match) matches++;
      } catch {
        // If comparison fails, assume no match
      }
    }
    
    return (matches / miniResults.length) * 100;
  };

  const calculateDisagreementScore = async (gpt41ResultsA: string[], gpt41ResultsB: string[]): Promise<number> => {
    let matches = 0;
    
    for (let i = 0; i < gpt41ResultsA.length; i++) {
      try {
        // Use same comparison logic as accuracy calculation
        // Treat Prompt A results as "ground truth" and compare against Prompt B
        const comparison = await aiService.compareResults(gpt41ResultsA[i], gpt41ResultsB[i]);
        if (comparison.match) matches++;
      } catch {
        // If comparison fails, assume no match (disagreement)
      }
    }
    
    // Calculate agreement percentage, then return disagreement
    const agreementPercentage = (matches / gpt41ResultsA.length) * 100;
    return Math.abs(100 - agreementPercentage); // Return disagreement score
  };

  const applyPrompt = (prompt: string) => {
    updateColumnPrompt(promptEvaluator.columnId, prompt);
    closePromptEvaluator();
  };

  const assessPromptComplexity = async (prompt: string): Promise<'simple' | 'medium' | 'complex'> => {
    try {
      const response = await fetch('/api/assess-complexity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error('Failed to assess complexity');
      }

      const result = await response.json();
      return result.complexity || 'medium';
    } catch (error) {
      console.error('Error assessing prompt complexity:', error);
      return 'medium'; // Default to medium on error
    }
  };

  const getSelectedCellInfo = () => {
    if (!selectedCell) return '';
    
    const cell = data[selectedCell.row]?.[selectedCell.col];
    return cell?.value || '';
  };

  const cellContent = getSelectedCellInfo();

  const openContactModal = () => {
    setContactModalOpen(true);
  };

  const closeContactModal = () => {
    setContactModalOpen(false);
  };

  return (
    <div className="w-full">
      {/* Combined Header with Cell Viewer and Toolbar */}
      <div className="flex items-center justify-between py-2 px-4 border-b border-gray-700" style={{ backgroundColor: '#212121' }}>
        <div className="flex-1">
          <p className="text-base" style={{ color: '#F3EFF3' }}>
            {cellContent || 'Select a cell to view its content'}
          </p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={addColumn}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-600 rounded-md transition-colors"
            style={{ backgroundColor: '#212121', color: '#F3EFF3' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2A2A2A'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#212121'}
          >
            <Plus size={16} />
            Add Column
          </button>
          <button
            onClick={addRow}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-600 rounded-md transition-colors"
            style={{ backgroundColor: '#212121', color: '#F3EFF3' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2A2A2A'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#212121'}
          >
            <Plus size={16} />
            Add Row
          </button>
          <button
            onClick={openContactModal}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white border border-blue-600 rounded-md hover:bg-blue-700 transition-colors"
          >
            Contact Me
          </button>
        </div>
      </div>

      {/* Spreadsheet Grid */}
      <div className="overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ backgroundColor: '#212121' }}>
              <th className="w-12 p-2 border-r border-gray-600 text-center text-sm font-medium" style={{ color: '#F3EFF3' }}>
                #
              </th>
              {columns.map((column) => (
                <th
                  key={column.id}
                  className="min-w-[200px] p-2 border-r border-gray-600 text-left"
                  style={{ backgroundColor: '#212121' }}
                >
                  {editingHeader === column.id ? (
                    <input
                      type="text"
                      value={column.name}
                      onChange={(e) => updateColumnName(column.id, e.target.value)}
                      onBlur={handleHeaderBlur}
                      onKeyDown={(e) => e.key === 'Enter' && handleHeaderBlur()}
                      className="w-full px-2 py-1 text-sm font-medium border border-gray-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ backgroundColor: '#121212', color: '#F3EFF3' }}
                      autoFocus
                    />
                  ) : (
                    <div className="flex items-center justify-between">
                      <div
                        onClick={() => handleHeaderClick(column.id)}
                        className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded flex-1"
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2A2A2A'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        {column.isAIColumn && (
                          <Bot size={14} className="text-blue-600" />
                        )}
                                                  <span className="text-sm font-medium" style={{ color: '#F3EFF3' }}>
                          {column.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {column.isAIColumn && column.prompt && (
                          <button
                            onClick={() => fillColumn(column.id)}
                            disabled={fillingColumns.has(column.id)}
                            className="p-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = '#2A2A2A')}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            title="Fill all empty cells in this column"
                          >
                            {fillingColumns.has(column.id) ? (
                              <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <Zap size={14} className="text-green-600" />
                            )}
                          </button>
                        )}
                        {column.isAIColumn && column.prompt && (
                          <button
                            onClick={() => openPromptEvaluator(column.id)}
                            className="p-1 rounded transition-colors"
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2A2A2A'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            title="Test and optimize prompts"
                          >
                            <FlaskConical size={14} className="text-purple-600" />
                          </button>
                        )}
                        <button
                          onClick={() => openPromptEditor(column.id)}
                          className="p-1 rounded transition-colors"
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2A2A2A'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          title={column.isAIColumn ? 'Edit AI prompt' : 'Add AI prompt'}
                        >
                          {column.isAIColumn ? (
                            <Edit3 size={14} className="text-blue-600" />
                          ) : (
                            <MoreHorizontal size={14} style={{ color: '#B0B0B0' }} />
                          )}
                        </button>
                        {columns.length > 1 && (
                          <button
                            onClick={() => deleteColumn(column.id)}
                            className="p-1 rounded transition-colors"
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5D1A1A'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            title="Delete column"
                          >
                            <Trash2 size={14} className="text-red-500" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr key={rowIndex} className="group" style={{ backgroundColor: '#121212' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1A1A1A'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#121212'}>
                <td className="p-2 border-r border-b border-gray-600 text-center text-sm relative" style={{ color: '#F3EFF3' }}>
                  <div className="flex items-center justify-center gap-1">
                    <span>{rowIndex + 1}</span>
                    {data.length > 1 && (
                      <button
                        onClick={() => deleteRow(rowIndex)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all"
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#5D1A1A'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        title="Delete row"
                      >
                        <Trash2 size={12} className="text-red-500" />
                      </button>
                    )}
                  </div>
                </td>
                {columns.map((column) => {
                  const cell = row[column.id] || { value: '' };
                  const isEditing = editingCell?.row === rowIndex && editingCell?.col === column.id;
                  
                  return (
                    <td
                      key={column.id}
                      className="p-0 border-r border-b border-gray-600 min-w-[200px]"
                    >
                      {isEditing ? (
                        <input
                          type="text"
                          value={cell.value}
                          onChange={(e) => updateCell(rowIndex, column.id, e.target.value)}
                          onBlur={handleCellBlur}
                          onKeyDown={(e) => e.key === 'Enter' && handleCellBlur()}
                          className="w-full p-2 text-sm border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                          style={{ backgroundColor: '#121212', color: '#F3EFF3' }}
                          autoFocus
                        />
                      ) : (
                        <div
                          onClick={() => handleCellClick(rowIndex, column.id)}
                          className="p-2 min-h-[40px] cursor-pointer transition-colors"
                          style={{ color: '#F3EFF3' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1A1A1A'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
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
                                    className="text-xs ml-2"
                                    style={{ color: '#B0B0B0' }}
                                    onMouseEnter={(e) => e.currentTarget.style.color = '#F3EFF3'}
                                    onMouseLeave={(e) => e.currentTarget.style.color = '#B0B0B0'}
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
                              <span className="text-sm" style={{ color: '#F3EFF3' }}>{cell.value}</span>
                              {cell.source && (
                                <div className="text-xs mt-1" style={{ color: '#B0B0B0' }}>
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
                                                          <span className="text-sm" style={{ color: '#B0B0B0' }}>Click to edit</span>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden" style={{ backgroundColor: '#212121' }}>
            <div className="flex items-center justify-between p-4 border-b border-gray-600">
              <div className="flex items-center gap-2">
                <Bot size={20} className="text-blue-600" />
                <h2 className="text-lg font-semibold" style={{ color: '#F3EFF3' }}>
                  AI Prompt for &quot;{columns.find(col => col.id === promptEditor.columnId)?.name}&quot;
                </h2>
              </div>
              <button
                onClick={closePromptEditor}
                className="p-1 rounded transition-colors"
                style={{ color: '#F3EFF3' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2A2A2A'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-4">
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2" style={{ color: '#F3EFF3' }}>
                  AI Instruction
                </label>
                <p className="text-sm mb-3" style={{ color: '#B0B0B0' }}>
                  Describe what the AI should research and fill in for this column. Be specific about the type of information you want.
                </p>
                <textarea
                  value={columns.find(col => col.id === promptEditor.columnId)?.prompt || ''}
                  onChange={(e) => updateColumnPrompt(promptEditor.columnId, e.target.value)}
                  placeholder="Example: Find the official website URL for this company."
                  className="w-full h-32 p-3 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  style={{ backgroundColor: '#121212', color: '#F3EFF3' }}
                />
              </div>
              
              {/* Model Selection Toggle */}
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <label className="block text-sm font-medium" style={{ color: '#F3EFF3' }}>
                    Task Complexity
                  </label>
                  <button
                    onClick={async () => {
                      const prompt = columns.find(col => col.id === promptEditor.columnId)?.prompt || '';
                      if (prompt.trim()) {
                        const complexity = await assessPromptComplexity(prompt);
                        const suggestedModel = (complexity === 'simple' || complexity === 'medium') ? 'gpt-4o-mini' : 'gpt-4.1';
                        setPromptEditorModel(suggestedModel);
                      }
                    }}
                    className="px-2 py-1 text-xs rounded transition-colors"
                    style={{ backgroundColor: '#7c3aed', color: '#F3EFF3' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#6d28d9'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#7c3aed'}
                    title="Auto-assess complexity"
                  >
                    Auto
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="gpt-4o-mini"
                      checked={promptEditorModel === 'gpt-4o-mini'}
                      onChange={(e) => setPromptEditorModel(e.target.value as 'gpt-4o-mini')}
                      className="mr-2"
                    />
                    <span className="text-sm" style={{ color: '#F3EFF3' }}>Simple (GPT-4o mini - Fast & Cheap)</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="gpt-4.1"
                      checked={promptEditorModel === 'gpt-4.1'}
                      onChange={(e) => setPromptEditorModel(e.target.value as 'gpt-4.1')}
                      className="mr-2"
                    />
                    <span className="text-sm" style={{ color: '#F3EFF3' }}>Complex (GPT-4.1 - Advanced & Accurate)</span>
                  </label>
                </div>
                <p className="text-xs mt-1" style={{ color: '#B0B0B0' }}>
                  Model selection is auto-suggested based on task complexity, but you can override manually.
                </p>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm" style={{ color: '#B0B0B0' }}>
                  <Bot size={16} className="text-blue-600" />
                  <span>
                    {columns.find(col => col.id === promptEditor.columnId)?.prompt 
                      ? `AI will use ${promptEditorModel === 'gpt-4o-mini' ? 'GPT-4o mini' : 'GPT-4.1'} for this column`
                      : 'Add a prompt to enable AI for this column'
                    }
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={closePromptEditor}
                    className="px-4 py-2 text-sm transition-colors"
                    style={{ color: '#B0B0B0' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#F3EFF3'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#B0B0B0'}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const prompt = columns.find(col => col.id === promptEditor.columnId)?.prompt || '';
                      await savePromptWithComplexity(promptEditor.columnId, prompt, promptEditorModel);
                      closePromptEditor();
                    }}
                    className="px-4 py-2 text-sm rounded-md transition-colors"
                    style={{ backgroundColor: '#2563eb', color: '#F3EFF3' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                  >
                    Save Prompt
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Evaluator Modal */}
      {promptEvaluator.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden" style={{ backgroundColor: '#212121' }}>
            <div className="flex items-center justify-between p-4 border-b border-gray-600">
              <div className="flex items-center gap-2">
                <FlaskConical size={20} className="text-purple-600" />
                <h2 className="text-lg font-semibold" style={{ color: '#F3EFF3' }}>
                  Prompt Optimization for &quot;{columns.find(col => col.id === promptEvaluator.columnId)?.name}&quot;
                </h2>
              </div>
              <button
                onClick={closePromptEvaluator}
                className="p-1 rounded transition-colors"
                style={{ color: '#F3EFF3' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2A2A2A'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              {!promptEvaluator.results ? (
                <div className="space-y-6">
                  <div className="border border-purple-600 rounded-lg p-4" style={{ backgroundColor: '#2D1B4E' }}>
                    <h3 className="text-sm font-medium mb-2" style={{ color: '#E6D7FF' }}>How Prompt Evaluation Works</h3>
                    <p className="text-sm" style={{ color: '#C4B0E6' }}>
                      We test your prompts on both GPT-4o mini (fast & cheap) and GPT-4.1 (expensive & accurate) to find the optimal cost/quality balance. 
                      The evaluation runs on all {data.length} rows in your dataset.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: '#F3EFF3' }}>
                        Prompt A (Current)
                      </label>
                      <textarea
                        value={promptEvaluator.promptA}
                        onChange={(e) => setPromptEvaluator(prev => ({ ...prev, promptA: e.target.value }))}
                        placeholder="Enter your first prompt variant..."
                        className="w-full h-32 p-3 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                        style={{ backgroundColor: '#121212', color: '#F3EFF3' }}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: '#F3EFF3' }}>
                        Prompt B (Alternative)
                      </label>
                      <textarea
                        value={promptEvaluator.promptB}
                        onChange={(e) => setPromptEvaluator(prev => ({ ...prev, promptB: e.target.value }))}
                        placeholder="Enter your second prompt variant..."
                        className="w-full h-32 p-3 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                        style={{ backgroundColor: '#121212', color: '#F3EFF3' }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <button
                      onClick={runPromptEvaluation}
                      disabled={!promptEvaluator.promptA || !promptEvaluator.promptB || promptEvaluator.isRunning}
                      className="px-6 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                      style={{ 
                        backgroundColor: promptEvaluator.isRunning ? '#6d28d9' : '#7c3aed', 
                        color: '#F3EFF3' 
                      }}
                      onMouseEnter={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = '#6d28d9')}
                      onMouseLeave={(e) => !e.currentTarget.disabled && (e.currentTarget.style.backgroundColor = '#7c3aed')}
                    >
                      {promptEvaluator.isRunning ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Running Evaluation...
                        </>
                      ) : (
                        <>
                          <FlaskConical size={16} />
                          Run Evaluation
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="border border-green-600 rounded-lg p-4" style={{ backgroundColor: '#1B3B36' }}>
                    <h3 className="text-sm font-medium mb-2" style={{ color: '#A7F3D0' }}>Evaluation Complete</h3>
                    <p className="text-sm" style={{ color: '#86EFAC' }}>
                      Tested both prompts on {data.length} rows using GPT-4o mini and GPT-4.1 models.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Prompt A Results */}
                    <div className="border border-gray-600 rounded-lg p-4" style={{ backgroundColor: '#1A1A1A' }}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold" style={{ color: '#F3EFF3' }}>Prompt A</h3>
                        <button
                          onClick={() => applyPrompt(promptEvaluator.promptA)}
                          className="px-3 py-1 text-sm rounded transition-colors"
                          style={{ backgroundColor: '#2563eb', color: '#F3EFF3' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                        >
                          Use This Prompt
                        </button>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm" style={{ color: '#B0B0B0' }}>Accuracy vs GPT-4.1:</span>
                          <span className="text-lg font-semibold" style={{ color: '#F3EFF3' }}>
                            {promptEvaluator.results.promptA.accuracy.toFixed(1)}%
                          </span>
                        </div>
                        
                        <div className="w-full bg-gray-600 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${promptEvaluator.results.promptA.accuracy}%` }}
                          ></div>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm" style={{ color: '#B0B0B0' }}>Total Cost:</span>
                          <span className="text-lg font-semibold" style={{ color: '#F3EFF3' }}>
                            ${promptEvaluator.results.promptA.cost.toFixed(4)}
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm" style={{ color: '#B0B0B0' }}>Avg Response Time:</span>
                          <span className="text-lg font-semibold" style={{ color: '#F3EFF3' }}>
                            {promptEvaluator.results.promptA.avgResponseTime.toFixed(0)}ms
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Prompt B Results */}
                    <div className="border border-gray-600 rounded-lg p-4" style={{ backgroundColor: '#1A1A1A' }}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold" style={{ color: '#F3EFF3' }}>Prompt B</h3>
                        <button
                          onClick={() => applyPrompt(promptEvaluator.promptB)}
                          className="px-3 py-1 text-sm rounded transition-colors"
                          style={{ backgroundColor: '#2563eb', color: '#F3EFF3' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
                        >
                          Use This Prompt
                        </button>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm" style={{ color: '#B0B0B0' }}>Accuracy vs GPT-4.1:</span>
                          <span className="text-lg font-semibold" style={{ color: '#F3EFF3' }}>
                            {promptEvaluator.results.promptB.accuracy.toFixed(1)}%
                          </span>
                        </div>
                        
                        <div className="w-full bg-gray-600 rounded-full h-2">
                          <div 
                            className="bg-purple-600 h-2 rounded-full" 
                            style={{ width: `${promptEvaluator.results.promptB.accuracy}%` }}
                          ></div>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm" style={{ color: '#B0B0B0' }}>Total Cost:</span>
                          <span className="text-lg font-semibold" style={{ color: '#F3EFF3' }}>
                            ${promptEvaluator.results.promptB.cost.toFixed(4)}
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm" style={{ color: '#B0B0B0' }}>Avg Response Time:</span>
                          <span className="text-lg font-semibold" style={{ color: '#F3EFF3' }}>
                            {promptEvaluator.results.promptB.avgResponseTime.toFixed(0)}ms
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Winner Analysis */}
                  <div className="border border-gray-600 rounded-lg p-4" style={{ backgroundColor: '#1A1A1A' }}>
                    <h3 className="text-lg font-semibold mb-3" style={{ color: '#F3EFF3' }}>Analysis</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="font-medium" style={{ color: '#F3EFF3' }}>Most Accurate:</span>
                        <p style={{ color: '#B0B0B0' }}>
                          Prompt {promptEvaluator.results.promptA.accuracy > promptEvaluator.results.promptB.accuracy ? 'A' : 'B'} 
                          ({Math.max(promptEvaluator.results.promptA.accuracy, promptEvaluator.results.promptB.accuracy).toFixed(1)}% accuracy)
                        </p>
                      </div>
                      <div>
                        <span className="font-medium" style={{ color: '#F3EFF3' }}>Most Cost-Effective:</span>
                        <p style={{ color: '#B0B0B0' }}>
                          Prompt {promptEvaluator.results.promptA.cost < promptEvaluator.results.promptB.cost ? 'A' : 'B'} 
                          (${Math.min(promptEvaluator.results.promptA.cost, promptEvaluator.results.promptB.cost).toFixed(4)})
                        </p>
                      </div>
                      <div>
                        <span className="font-medium" style={{ color: '#F3EFF3' }}>Fastest:</span>
                        <p style={{ color: '#B0B0B0' }}>
                          Prompt {promptEvaluator.results.promptA.avgResponseTime < promptEvaluator.results.promptB.avgResponseTime ? 'A' : 'B'} 
                          ({Math.min(promptEvaluator.results.promptA.avgResponseTime, promptEvaluator.results.promptB.avgResponseTime).toFixed(0)}ms avg)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Disagreement Score */}
                  <div className="border border-blue-600 rounded-lg p-4" style={{ backgroundColor: '#1B2A4E' }}>
                    <h3 className="text-lg font-semibold mb-2" style={{ color: '#BFDBFE' }}>Evaluation Validity</h3>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium" style={{ color: '#BFDBFE' }}>GPT-4.1 Disagreement Score:</span>
                        <p className="text-sm mt-1" style={{ color: '#93C5FD' }}>
                          How much the expensive models disagrees between prompts
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`text-2xl font-bold ${
                          promptEvaluator.results.disagreementScore < 20 
                            ? 'text-green-600' 
                            : promptEvaluator.results.disagreementScore < 40 
                            ? 'text-yellow-600' 
                            : 'text-red-600'
                        }`}>
                          {promptEvaluator.results.disagreementScore.toFixed(1)}%
                        </span>
                        <p className={`text-xs mt-1 ${
                          promptEvaluator.results.disagreementScore < 20 
                            ? 'text-green-600' 
                            : promptEvaluator.results.disagreementScore < 40 
                            ? 'text-yellow-600' 
                            : 'text-red-600'
                        }`}>
                          {promptEvaluator.results.disagreementScore < 20 
                            ? 'High Validity' 
                            : promptEvaluator.results.disagreementScore < 40 
                            ? 'Medium Validity' 
                            : 'Low Validity'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="w-full bg-gray-600 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            promptEvaluator.results.disagreementScore < 20 
                              ? 'bg-green-500' 
                              : promptEvaluator.results.disagreementScore < 40 
                              ? 'bg-yellow-500' 
                              : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(promptEvaluator.results.disagreementScore, 100)}%` }}
                        ></div>
                      </div>
                      <p className="text-xs mt-2" style={{ color: '#93C5FD' }}>
                        {promptEvaluator.results.disagreementScore < 20 
                          ? 'Low disagreement indicates accuracy comparisons are more meaningful.' 
                          : promptEvaluator.results.disagreementScore < 40 
                          ? 'Moderate disagreement suggests some differences in prompt performance.' 
                          : 'High disagreement indicates evaluation may be less reliable.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => setPromptEvaluator(prev => ({ ...prev, results: undefined }))}
                      className="px-4 py-2 text-sm transition-colors"
                      style={{ color: '#B0B0B0' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#F3EFF3'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#B0B0B0'}
                    >
                      Run Another Test
                    </button>
                    <button
                      onClick={closePromptEvaluator}
                      className="px-4 py-2 text-sm rounded-md transition-colors"
                      style={{ backgroundColor: '#4B5563', color: '#F3EFF3' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#374151'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#4B5563'}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {contactModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                Get in Touch
              </h2>
              <button
                onClick={closeContactModal}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-gray-700 text-sm leading-relaxed">
                    If you liked this demo, I&apos;d love to chat!
                  </p>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    My twitter/X is <a href="https://twitter.com/rohankalia_" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">@rohankalia_</a>
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src="/profile_square.jpg" 
                      alt="Rohan's Profile" 
                      className="w-full h-full rounded-full object-cover"
                      onError={(e) => {
                        const img = e.currentTarget;
                        const fallback = img.nextElementSibling as HTMLElement | null;
                        img.style.display = 'none';
                        if (fallback) {
                          fallback.style.display = 'flex';
                        }
                      }}
                    />
                    <div className="w-full h-full rounded-full bg-gray-300 flex items-center justify-center text-gray-600 text-lg font-semibold" style={{ display: 'none' }}>
                      R
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button
                  onClick={closeContactModal}
                  className="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 