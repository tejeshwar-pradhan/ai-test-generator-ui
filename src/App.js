import React, { useState, useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Prism from 'prismjs';
import 'prismjs/themes/prism.css';
import './resources/styles.css';
import CodeBlock from './components/CodeBlock';
import apiClient from './components/apiClient'; // Custom API client

// Reusable component for JIRA dropdown selection
const JiraDropdown = ({ jiraData, activeJira, setActiveJira }) => (
  <div className="jira-dropdown">
    <label htmlFor="jira-select">Select Jira Issue:</label>
    <select
      id="jira-select"
      onChange={(e) => setActiveJira(e.target.value)}
      value={activeJira || ''}
    >
      <option value="">Select a Jira Issue</option>
      {jiraData.map((jira) => (
        <option key={jira._id} value={jira._id}>
          {jira.issue_key} : {jira.status}
        </option>
      ))}
    </select>
  </div>
);

function App() {
  const [activeTab, setActiveTab] = useState('generate');
  const [jiraIds, setJiraIds] = useState('');
  const [analysisOutput, setAnalysisOutput] = useState('');
  const [error, setError] = useState('');
  const [testCases, setTestCases] = useState('');
  const [jiraData, setJiraData] = useState([]);
  const [modifiedTestCases, setModifiedTestCases] = useState({});
  const [activeJira, setActiveJira] = useState(null);
  const [generatedCode, setGeneratedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJiras, setSelectedJiras] = useState({});

  const showOverlay = () => setLoading(true);
  const hideOverlay = () => setLoading(false);

  const filteredJiraData = jiraData.filter(jira =>
    jira.issue_key.toLowerCase().includes(searchQuery.toLowerCase()) ||
    jira.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (activeTab === 'verify' || activeTab === 'automated') {
      const fetchJiraData = async () => {
        showOverlay();
        try {
          const response = await apiClient('/get-jira-data');
          if (!response.ok) throw new Error('Failed to fetch Jira data');
          const data = await response.json();
          setJiraData(data.jira_data);
        } catch (error) {
          setError(`Error: ${error.message || 'Failed to fetch Jira data.'}`);
        } finally {
          hideOverlay();
        }
      };
      fetchJiraData();
    }
  }, [activeTab]);

  const handleTabClick = tab => setActiveTab(tab);

  const processedJiraData = jiraData.filter(jira => jira.status === 'processed');

  const generateAutomatedCode = async () => {
    if (!activeJira) return setError('Please select a Jira issue first.');

    showOverlay();
    try {
      const selectedJira = jiraData.find(jira => jira._id === activeJira);
      if (!selectedJira) return setError('Selected Jira issue not found.');

      const { jira_text, test_cases } = selectedJira;
      const response = await apiClient('/generate-automation-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jira_key: selectedJira.issue_key, jira_text, test_cases }),
      });

      if (!response.ok) throw new Error('Failed to generate automated code.');

      const data = await response.json();
      setGeneratedCode(data.automated_code);
      alert('Automated code generated successfully!');
    } catch (err) {
      setError(`Error: ${err.message || 'Failed to generate automated code.'}`);
    } finally {
      hideOverlay();
    }
  };

  const handleGenerateTestCases = async () => {
    if (!jiraIds) return alert('Please enter JIRA IDs.');

    const ids = jiraIds.split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length === 0) return alert('Please enter at least one JIRA ID.');

    showOverlay();
    try {
      const response = await apiClient('/generate-test-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jira_ids: ids }),
      });

      if (!response.ok) throw new Error('Failed to generate test cases');
      const data = await response.json();
      setTestCases(data.testCases);
    } catch (error) {
      setError(`Error generating test cases: ${error.message}`);
    } finally {
      hideOverlay();
    }
  };

  const handleAnalyze = async () => {
    // Split and trim JIRA IDs, filter out any empty values
    const ids = jiraIds.split(',').map(id => id.trim()).filter(Boolean);

    // Validate that at least one JIRA ID was entered
    if (ids.length === 0) {
        return setError('Please enter at least one JIRA ID.');
    }

    // Show loading overlay and reset error/test case states
    showOverlay();
    setError('');
    setAnalysisOutput('');
    setTestCases('');

    try {
        // Dynamically determine the API URL (for development or production)
        const apiUrl = process.env.REACT_APP_API_URL

        // Make the request to the backend
        const response = await apiClient('/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jira_ids: ids }),
        });

        // Check if the response is okay
        if (!response.ok) {
            throw new Error(`Failed to analyze Jira IDs: ${response.statusText}`);
        }

        // Parse the response data
        const data =  await response.json();
        // Validate that the data is in the expected format
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid response format');
        }

        // Set the analysis output
        setAnalysisOutput(data);

    } catch (err) {
        // More detailed error handling
        setError(`Error: ${err.message || 'Failed to connect to the backend.'}`);
    } finally {
        // Hide the loading overlay
        hideOverlay();
    }
};


  const handleTestCaseChange = (e, jiraId) => {
    setModifiedTestCases(prevState => ({
      ...prevState,
      [jiraId]: e.target.value,
    }));
  };

  const handleUpdateTestCases = async (jiraId) => {
    const selectedJira = jiraData.find(jira => jira._id === jiraId);

    // Check if selectedJira is found
    if (!selectedJira) {
      return setError('Selected Jira issue not found.');
    }

    const { jira_text, test_cases } = selectedJira;
    const updatedTestCase = modifiedTestCases[jiraId] || '';

    if (!updatedTestCase.trim()) {
      return setError('Test cases cannot be empty!');
    }

    const diff_text = await getDiff(selectedJira.test_cases, updatedTestCase);
    try {
      const response = await apiClient('/update-test-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue_key: selectedJira.issue_key,
          jira_text: selectedJira.jira_text,
          changes: diff_text.toString(),
          new_test_cases: updatedTestCase,
          status: 'Test_case_verified',
        }),
      });

      if (!response.ok) throw new Error('Failed to update test cases.');
      alert('Test cases updated successfully!');
    } catch (err) {
      setError(`Error: ${err.message}`);
    }
  };

  const getDiff = async (old_test, new_test) => {
    try {
      const response = await apiClient('/detect-changes', {
        method: 'POST', // Change to POST to send a body
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          old_text: old_test,
          new_text: new_test,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get the difference.');
      }

      // Parse the response as JSON and return it
      const data = await response.json(); // Assuming the server returns a JSON response
      alert('Data has been changed!');

      // Return the difference as a string
      const diff_text = String(data.diff || ''); // Ensure diff_text is a string
      return diff_text;

    } catch (err) {
      setError(`Error: ${err.message}`);
      throw err; // Optionally rethrow the error to be handled by the calling function
    }
  };

  const toggleJiraSelection = (id) => {
      setSelectedJiras(prev => ({
        ...prev,
        [id]: !prev[id]
      }));
    };


  // Function to highlight code using Prism.js
  const highlightCode = () => {
    const elements = document.querySelectorAll('pre code');
    elements.forEach((element) => {
      Prism.highlightElement(element);
    });
  };

  useEffect(() =>
  {
    highlightCode();
  }, [generatedCode, analysisOutput]); // Re-run code highlighting when generated code or analysis output changes

  const MixedLanguageCodeRenderer = ({ codeString }) => {
    const codeBlockRegex = /```(java|typescript)\n([\s\S]*?)```/g;
    const codeSegments = [];
    let lastIndex = 0;

    codeString.replace(codeBlockRegex, (match, language, code, offset) => {
      if (offset > lastIndex) {
        codeSegments.push({ type: 'text', content: codeString.slice(lastIndex, offset) });
      }
      codeSegments.push({ type: 'code', language, code });
      lastIndex = offset + match.length;
      return match;
    });

    if (lastIndex < codeString.length) {
      codeSegments.push({ type: 'text', content: codeString.slice(lastIndex) });
    }

    return (
      <div>
        {codeSegments.map((segment, index) => {
          if (segment.type === 'text') {
            return <p key={index}>{segment.content}</p>;
          }
          return (
            <CodeBlock key={index} codeString={segment.code} language={segment.language} />
          );
        })}
      </div>
    );
  };

  return (
    <div>
        {loading && (
        <div className="overlay">
          <div className="spinner"></div>
        </div>
      )}
        <header>
            <h1>AI Based Test Generator</h1>
        </header>

        <div className="tabs">
            {['generate', 'verify', 'automated'].map(tab => (
          <div
            key={tab}
            className={`tab ${activeTab === tab ? 'active-tab' : ''}`}
            onClick={() => handleTabClick(tab)}
          >
            {tab === 'generate' ? 'Generate Test Cases' : tab === 'verify' ? 'Verify & Update Test Cases' : 'Automated Test Cases'}
          </div>
        ))}
        </div>

 <div id="generate" className={`container ${activeTab === 'generate' ? 'visible' : ''}`}>
    <h2>Generate Test Cases</h2>
    <div className="form-group">
        <label htmlFor="jira-ids">Enter JIRA IDs (comma-separated):</label>
        <textarea
            id="jira-ids"
            rows="4"
            placeholder="Enter JIRA IDs"
            value={jiraIds}
            onChange={e => setJiraIds(e.target.value)}
        />
    </div>
    <button className="action-btn" onClick={handleAnalyze} disabled={loading}>
        {loading ? 'Analyzing...' : 'Analyze and Verify'}
    </button>
    <div>
    {analysisOutput && (
        <div>
            <strong>Analysis Output:</strong>

            {/* Display analysis for each JIRA ID entered */}
            <div>
                {jiraIds.split(',').map((jiraId, index) => {
                    const trimmedJiraId = jiraId.trim();
                    const analysisData = analysisOutput[trimmedJiraId];
                    // Check if there is any data for the JIRA ID
                    if (analysisData) {
                        // Convert markdown to HTML
                        const sanitizedContent = DOMPurify.sanitize(marked(analysisData));

                        return (
                            <div key={index} className="jira-checkbox">
                                <input
                                    type="checkbox"
                                    checked={selectedJiras[trimmedJiraId] || false}
                                    onChange={() => toggleJiraSelection(trimmedJiraId)}
                                />
                                <span>{trimmedJiraId}</span>

                                {/* Render the sanitized HTML content */}
                                <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
                            </div>
                        );
                    } else {
                        return (
                            <div key={index}>
                                <p>No analysis data available for {trimmedJiraId}</p>
                            </div>
                        );
                    }
                })}
            </div>

            {/* Button to generate test cases */}
            <button className="action-btn" onClick={handleGenerateTestCases} disabled={loading}>
                {loading ? 'Generating Test Cases...' : 'Generate Test Cases'}
            </button>
        </div>
    )}
</div>


    {testCases && (
        <div>
            <h3>Generated Test Cases:</h3>
            <pre>{testCases}</pre>
        </div>
    )}
</div>


        <div id="verify" className={`container ${activeTab === 'verify' ? 'visible' : ''}`}>
            {activeTab === 'verify' && jiraData.length > 0 && (
              <div>
                <h3>Jira IDs with Test Cases:</h3>
                <input
                  type="text"
                  placeholder="Search Jira Issues [Filter]"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="jira-search-input"
                />
                <JiraDropdown
                  jiraData={filteredJiraData}
                  activeJira={activeJira}
                  setActiveJira={setActiveJira}
                />
                {activeJira && (
                  <div className="jira-details">
                    <div className="test-case-section">
                      <h4><strong>Test Cases:</strong></h4>
                      {jiraData.find(jira => jira._id === activeJira)?.test_cases || 'No test cases available'}
                    </div>
                    <div className="updatable-test-case-section">
                      <h4><strong>Update Test Cases:</strong></h4>
                      <textarea
                        placeholder="Update test cases"
                        value={modifiedTestCases[activeJira] || jiraData.find(jira => jira._id === activeJira)?.test_cases || ''}
                        onChange={e => handleTestCaseChange(e, activeJira)}
                      />
                      <button onClick={() => handleUpdateTestCases(activeJira)}>
                        Update Test Cases (verified)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
        </div>

        <div id="automated" className={`container ${activeTab === 'automated' ? 'visible' : ''}`}>
            <h2>Automated Test Cases</h2>
            <JiraDropdown jiraData={jiraData.filter(jira => jira.status === 'CODE_GENERATED' || jira.status ==='Test_case_verified')} activeJira={activeJira} setActiveJira={setActiveJira} />
            {activeJira && (
              <div className="jira-details">
                <div className="test-case-section">
                  <h4><strong>Test Cases:</strong></h4>
                  <pre>{jiraData.find(jira => jira._id === activeJira)?.test_cases || 'No test cases available.'}</pre>
                </div>
                <div>
                  <h4><strong>Automated Code:</strong></h4>
                  {(jiraData.find(jira => jira._id === activeJira)?.automated_tests || []).map((testCase, index) => {
                    const [title, content] = Object.entries(testCase)[0];
                    return (
                      <div key={index} style={{ marginBottom: '2rem' }}>
                        <h3>{title}</h3>
                        <MixedLanguageCodeRenderer codeString={content.toString()} />
                      </div>
                    );
                  })}
                </div>
                {(!jiraData.find(jira => jira._id === activeJira)?.automated_code) && (
                  <button className="action-btn" onClick={generateAutomatedCode} disabled={loading}>
                    {loading ? 'Generating Automated Code...' : 'Create Automated Code for Test'}
                  </button>
                )}
                {generatedCode && (
                  <div>
                    <h4><strong>Generated Automated Code:</strong></h4>
                    <MixedLanguageCodeRenderer codeString={generatedCode} />
                  </div>
                )}
              </div>
            )}
        </div>

        <footer>
            <p>&copy; 2025 AI Based Test Generator</p>
        </footer>
    </div>
  );
}

export default App;
