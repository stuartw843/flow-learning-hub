// JavaScript for handling module addition and content management
document.getElementById('add-module').addEventListener('click', function() {
    const moduleName = prompt('Enter module name:');
    if (moduleName) {
        const li = document.createElement('li');
        li.textContent = moduleName;
        document.getElementById('module-list').appendChild(li);
    }
});
