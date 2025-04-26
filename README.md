# CropWise : ofarm-cb4a2.web.app

🌱 Inspiration
    Food is one of the basic needs for survival. A famine is defined as an event of food scarcity, often resulting in mass amounts of death. In such emergencies, we need to get the most food, with the right nutrients, out of the limited land we have. Considering that not all crops are created equal, whereby some crops thrive in hot, tropical climates but others dread these conditions, different crops may need to be planted for optimal outcomes at different areas. Hence, we aim to answer the question: "What crop is the most efficient and nutrient rich to grow, right here, right now?"

🚀 What it does
  CropWise is a web app that helps optimize food production by giving users crop suggestions that produce the highest nutrient yield given their farmland's weather conditions. Users can select their farmland based on a real life location, and a 3D rendered grid of their farmland will be created, complete with:
    - Weather animations that reflect current conditions
    - Detailed environmental data analysis
    - Dynamically rendered heatmap based on location's latest weather data
    - Custom-made regression machine learning model for crop yield prediction
    
Upon interacting with our 3D scene, users can select a nutrient focus of their choice (Calories, Carbohydrates, EFA, Oil, or Protein), and the plane will dynamically optimise its crop suggestions (Barley, Corn, Potato, Rice, Soybean, Sugarcane, Sunflower, or Wheat) for this nutrient.

🛠️ How we built it
    The frontend was developed using Three.js for 3D rendering and styled with CSS for a clean, responsive interface. After logging in—integrated seamlessly with Firebase—users are prompted to select a plot of farmland from a 2D map of the Earth. This selection is powered by Mapbox, allowing users to define a rectangular region using four coordinates. Once selected, a 3D subdivided plane representing the chosen location is generated and displayed, complete with coordinate references. Weather data is retrieved from the Open-Meteo API and used to enrich the visualization with real-time animations and contextual information. Our key output, the optimal yield and its most suitable crop, is visualized as a heatmap overlay on the 3D plane through a color mesh algorithm, sorting green areas as best yield and red areas as worst yield.

  
🔮 What's next for CropWise
    Expand crop selection to include more varieties suited to local weather patterns
    Add more nutrient categories like Vitamins and Minerals for a more balanced diet
    Introduce more dynamic 3D rendering for irregular plots and topographic variations
    Extend the machine learning pipeline to generate crop rotation schedules
    Account for growth time of crops in recommendations

🎮 Test it out!
Email: test@test.com | Password: test123
