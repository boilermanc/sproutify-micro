import { useState } from 'react';
import './TablePage.css';
import { Eye, Edit } from 'lucide-react';

const RecipesPage = () => {
  const [recipes] = useState([
    { id: 1, name: 'Standard Sunflower', variety: 'Sunflower', soakTime: '8 hours', harvestDays: 10, difficulty: 'Easy' },
    { id: 2, name: 'Spicy Radish Mix', variety: 'Radish', soakTime: 'None', harvestDays: 7, difficulty: 'Medium' },
    { id: 3, name: 'Sweet Pea Shoots', variety: 'Pea Shoots', soakTime: '12 hours', harvestDays: 12, difficulty: 'Easy' },
  ]);

  return (
    <div className="table-page">
      <div className="page-header">
        <div>
          <h1>Recipes</h1>
          <p className="subtitle">Manage your Recipes</p>
        </div>
        <button className="btn btn-primary" onClick={() => alert('Create Recipe feature coming soon!')}>+ Add New</button>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Variety</th>
              <th>Soak Time</th>
              <th>Harvest (Days)</th>
              <th>Difficulty</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {recipes.map(recipe => (
              <tr key={recipe.id}>
                <td className="font-semibold">{recipe.name}</td>
                <td>{recipe.variety}</td>
                <td>{recipe.soakTime}</td>
                <td>{recipe.harvestDays}</td>
                <td>
                   <span className="badge badge-viewer">{recipe.difficulty}</span>
                </td>
                <td>
                  <div className="actions">
                    <button className="action-icon" onClick={() => alert(`View recipe: ${recipe.name}`)}><Eye size={18} color="#5B7C99" /></button>
                    <button className="action-icon" onClick={() => alert(`Edit recipe: ${recipe.name}`)}><Edit size={18} color="#5B7C99" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecipesPage;
